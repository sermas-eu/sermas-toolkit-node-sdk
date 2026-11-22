import {
  Logger,
  SermasApiClient,
  type AgentChangedDto,
  type AgentEvaluatePromptDto,
  type AppToolsDTO,
  type DialogueMessageDto,
  type DialogueToolTriggeredEventDto,
  type DialogueToolsRepositoryDto,
  type PlatformAppDto,
  type SessionChangedDto,
  type SessionDto,
  type SessionStorageRecordDto,
  type SessionStorageSearchDto,
  type UIContentDto,
  type UIInteractionEventDto,
} from "@sermas/api-client";
// default import: eventemitter2 is CommonJS, and Node finds no named export in it
import EventEmitter2 from "eventemitter2";
import { defaults } from "../config/defaults.js";

export type SermasConfig = {
  SERMAS_BASE_URL: string;
  SERMAS_CLIENT_ID: string;
  SERMAS_CLIENT_SECRET: string;
  SERMAS_APPID: string;
};

class SermasApp {
  private logger: Logger;
  private baseUrl: string;

  private app: PlatformAppDto | null = null;
  public client: SermasApiClient;

  private clientId: string;
  private clientSecret: string;
  private appId: string;

  public emitter: EventEmitter2;
  public subs: (() => void)[] = [];

  constructor(
    sermasConfig: SermasConfig,
    emitter?: EventEmitter2,
    logger: Logger = new Logger("SERMAS SDK"),
  ) {
    this.baseUrl =
      sermasConfig.SERMAS_BASE_URL || defaults.sermas.SERMAS_BASE_URL;
    this.appId = sermasConfig.SERMAS_APPID || defaults.sermas.SERMAS_APPID;
    this.clientId =
      sermasConfig.SERMAS_CLIENT_ID || defaults.sermas.SERMAS_CLIENT_ID;
    this.clientSecret =
      sermasConfig.SERMAS_CLIENT_SECRET || defaults.sermas.SERMAS_CLIENT_SECRET;

    this.logger = logger;

    this.emitter = emitter || new EventEmitter2();

    this.client = new SermasApiClient({
      baseURL: this.getBaseUrl(),
      appId: this.appId,
      logger,
    });
    this.initialize();
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  async initialize() {
    // return await this.getClientCredentials();

    await this.setupSermasClient();

    this.addSub(
      async () =>
        await this.client.events.session.onSessionChanged(
          (ev: SessionChangedDto) => {
            this.logger.debug(
              `session changed ${ev.operation.toUpperCase()} sessionId=${ev.record.sessionId}`,
            );
            this.emitter.emit(`session`, ev);
          },
        ),
    );

    this.addSub(
      async () =>
        await this.client.events.dialogue.onToolTriggered(
          (event: DialogueToolTriggeredEventDto) => {
            this.logger.debug("Tool triggered: " + event.name);
            this.emitter.emit(`tool`, event);
          },
        ),
    );

    this.addSub(
      async () =>
        await this.client.events.ui.onInteraction(
          (event: UIInteractionEventDto) => {
            // this.logger.debug('UI interaction: ' + event.interaction);
            this.emitter.emit(`ui.interaction`, event);
          },
        ),
    );

    this.addSub(
      async () =>
        await this.client.events.session.onAgentChanged(
          (event: AgentChangedDto) => {
            this.logger.debug("Agent changed: " + event.operation);
            this.emitter.emit(`agent.changed`, event);
          },
        ),
    );

    await this.getApp();
    this.logger.debug("Sermas initialization completed");
  }

  private async setupSermasClient() {
    this.logger.debug("Initializing sermas client.");

    try {
      this.logger.debug(`Loading token`);
      await this.client.loadToken(this.clientId, this.clientSecret);
    } catch (e: unknown) {
      this.logger.error(`Failed to load token, retrying`);
      if (e instanceof Error) this.logger.debug(e.stack);
      setTimeout(() => this.setupSermasClient(), 1000);
      return;
    }

    this.logger.debug(`sermas client ready`);
    this.emitter.emit("sermas.ready");
  }

  addSub(sub: () => Promise<() => void>) {
    sub()
      .then((fn) => {
        this.subs.push(fn);
      })
      .catch((e) => {
        this.logger.error(`Subscribe failed: ${e?.stack}`);
      });
  }
  async prompt(prompt: AgentEvaluatePromptDto) {
    return await this.client.api.session.prompt({
      requestBody: prompt,
    });
  }

  async sendChatMessage(ev: DialogueMessageDto) {
    await this.client.api.dialogue.chatMessage({
      appId: ev.appId,
      sessionId: ev.sessionId!,
      requestBody: ev,
    });
  }

  async sendUiContent(ev: UIContentDto) {
    // await this.client.events.ui.content(ev);
    await this.client.api.ui.showContent({ requestBody: ev });
  }

  async getApp() {
    if (this.app) return this.app;
    this.logger.debug(`Load app ${this.appId}`);
    try {
      this.app = await this.client.api.platform.readApp({ appId: this.appId });
      return this.app;
    } catch (e: unknown) {
      if (e instanceof Error)
        this.logger.error(`Failed to load app ${this.appId}: ${e.stack}`);
      return null;
    }
  }

  async updateAppTools(tools: AppToolsDTO[]) {
    await this.client.api.platform.updateAppTools({
      appId: this.appId,
      requestBody: tools,
    });
    this.logger.debug("Updated tools");
  }

  async setTools(repository: DialogueToolsRepositoryDto) {
    await this.client.api.dialogue.setTools({
      repositoryId: repository.repositoryId!,
      requestBody: repository,
    });
    this.logger.debug("Updated tools");
  }

  async addTools(repository: DialogueToolsRepositoryDto) {
    await this.client.api.dialogue.addTools({
      repositoryId: repository.repositoryId!,
      requestBody: repository,
    });
    this.logger.debug("Add tools");
  }

  async readSession(sessionId: string): Promise<SessionDto | null> {
    try {
      return await this.client.api.session.readSession({ sessionId });
    } catch (e: unknown) {
      if (e instanceof Error)
        this.logger.error(`Failed to readSession: ${e.stack}`);
      return null;
    }
  }

  async getRecord(storageId: string) {
    try {
      return await this.client.api.session.getRecord({ storageId });
    } catch (e: unknown) {
      if (e instanceof Error && e.message.indexOf("Not Found") === -1)
        this.logger.error(`Failed to getRecord: ${e.stack}`);
      return null;
    }
  }

  async findRecords(query: SessionStorageSearchDto) {
    try {
      return await this.client.api.session.findRecords({
        requestBody: query,
      });
    } catch (e: unknown) {
      if (e instanceof Error)
        this.logger.error(`Failed to findRecords: ${e.stack}`);
      return null;
    }
  }

  async setRecord(storage: SessionStorageRecordDto) {
    try {
      return await this.client.api.session.setRecord({
        requestBody: storage,
      });
    } catch (e: unknown) {
      if (e instanceof Error)
        this.logger.error(`Failed to setRecord: ${e.stack}`);
      return null;
    }
  }

  async generateQRCode(data: string) {
    try {
      return await this.client.api.ui.generateQrCode({
        requestBody: { version: 5, data },
      });
    } catch (e: unknown) {
      if (e instanceof Error)
        this.logger.error(`Failed to generate QR code: ${e.stack}`);
      return null;
    }
  }
}

export { SermasApp };
