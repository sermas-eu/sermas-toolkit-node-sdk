import {
  Logger,
  sleep,
  type ButtonDto,
  type ButtonsUIContentDto,
  type SessionChangedDto,
  type SupportedContentTypes,
  type UIContentDto,
  type UIContentOptionsDto,
} from "@sermas/api-client";
import { ulid } from "ulidx";
import type { BaseSessionWrapper } from "../dto/session.js";
import { SermasApp } from "./sermas.js";
import { Store } from "./store.js";

class UI {
  private sermas: SermasApp;
  private store: Store;

  private readonly logger: Logger;
  private backMenuOptions: string[] = [];

  constructor(
    sermas: SermasApp,
    store: Store,
    logger: Logger | undefined = undefined,
  ) {
    this.sermas = sermas;
    this.store = store;

    this.logger = logger || new Logger(`SERMAS SDK UI`);

    this.sermas.emitter.on("session", this.onSessionChange.bind(this));
  }

  // @OnEvent("session")
  async onSessionChange(ev: SessionChangedDto) {
    if (!ev.record.sessionId) return;
    const session = await this.store.getSessionWrapper(ev.record.sessionId);
    switch (ev.operation) {
      case "removed":
        if (!session) return;
        await this.sendClearScreen(session);
        break;
    }
  }

  createBackButton(value: string) {
    this.backMenuOptions = Array.from(
      new Set([...this.backMenuOptions, value]),
    );

    const button: ButtonDto = {
      value,
      classes: ["is-light"],
    };

    return button;
  }

  async sendBackMenu(session: BaseSessionWrapper, labels: string | string[]) {
    labels = typeof labels === "string" ? [labels] : labels;
    await this.sendButtons(
      session,
      "",
      labels.map((value) => this.createBackButton(value)),
      undefined,
      {
        ttsEnabled: false,
      },
    );
  }

  async sendMenuButtons(session: BaseSessionWrapper, buttons: ButtonDto[]) {
    await this.sendButtons(session, "", buttons, undefined, {
      ttsEnabled: false,
    });
  }

  async sendAgentMessage(
    session: BaseSessionWrapper,
    message: string,
    messageLanguage?: string,
  ) {
    const app = await this.sermas.getApp();

    if (!app) {
      this.logger.warn(`app is not available`);
      return;
    }

    // an app without an avatar repository has no gender to pass
    const avatar = app.repository?.avatars?.find(
      (a) => a.name === app.settings?.avatar,
    );
    const gender = avatar?.gender;

    await this.sermas.sendChatMessage({
      ...session,
      text: message,
      appId: app.appId,
      actor: "agent",
      gender,
      language: messageLanguage,
      chunkId: this.getChunkId(),
    });
  }

  async sendButtons(
    session: BaseSessionWrapper,
    label: string,
    list: (string | ButtonDto)[],
    metadata: { [key: string]: unknown } = {},
    options: UIContentOptionsDto = {
      clearScreen: false,
      ttsEnabled: true,
      stopSpeech: false,
    },
  ) {
    if (!session) {
      this.logger.warn(`[sendButtons] Session is empty`);
      return;
    }

    const ev: ButtonsUIContentDto = {
      ...session,
      metadata,
      options: {
        ...options,
        language: options.language || undefined,
      },
      content: {
        label,
        list: list.map((button) => {
          if (typeof button === "string") return { value: button };
          return button;
        }),
      },
      contentType: "buttons",
      chunkId: this.getChunkId(),
    };
    await this.sermas.sendUiContent(ev);
  }

  async sendClearScreen<T extends BaseSessionWrapper>(session: T) {
    const ev: UIContentDto = {
      ...session,
      metadata: {},
      options: {
        clearScreen: true,
        stopSpeech: true,
      },
      content: {},
      contentType: "clear-screen",
    };
    await this.sermas.sendUiContent(ev);
    await sleep(200);
  }

  async sendImage(
    session: BaseSessionWrapper,
    data: string,
    width: number,
    height: number,
  ) {
    this.logger.debug(
      `Send image sessionId=${session.sessionId} appId=${session.appId}`,
    );
    const ev: UIContentDto = {
      ...session,
      metadata: {},
      options: {
        clearScreen: false,
        stopSpeech: false,
      },
      content: { src: data, alt: "no image", width, height },
      contentType: "image",
    };
    await this.sermas.sendUiContent(ev);
  }

  async sendQrCodeScanner(session: BaseSessionWrapper) {
    this.logger.debug(
      `Send image sessionId=${session.sessionId} appId=${session.appId}`,
    );
    const ev: UIContentDto = {
      ...session,
      metadata: {},
      options: {
        clearScreen: false,
        stopSpeech: false,
      },
      content: {},
      contentType: "qrcode-scanner" as SupportedContentTypes,
    };
    await this.sermas.sendUiContent(ev);
  }

  getChunkId(ts?: Date) {
    return ulid(ts ? new Date(ts).getTime() : undefined);
  }

  matchBackMenu(selection: string) {
    return selection && this.backMenuOptions.indexOf(selection) > -1;
  }
}

export { UI };
