import {
  Logger,
  type SessionChangedDto,
  type SessionStorageRecordDto,
} from "@sermas/api-client";
import { SermasApp } from "./sermas.js";
import { uuidv4 } from "../config/util.js";
import type { BaseSessionWrapper } from "../dto/session.js";

class Store {
  private readonly logger: Logger;

  private sermas: SermasApp;
  private sessions: Record<string, unknown> = {};

  private locks: { [sessionId: string]: Promise<any> } = {};

  constructor(sermas: SermasApp, logger: Logger | undefined = undefined) {
    this.sermas = sermas;
    this.logger = logger || new Logger(`SERMAS SDK Store`);

    this.sermas.emitter.on("session", this.onSessionChange.bind(this));
  }

  // @OnEvent("session")
  async onSessionChange(ev: SessionChangedDto) {
    if (!ev.record.sessionId) return;
    const session = await this.saveSessionWrapper(ev);
    switch (ev.operation) {
      case "created":
        if (!session) {
          this.logger.warn(
            `Failed to get session for sessionId=${ev.record.sessionId}`,
          );
          return;
        }
        this.sermas.emitter.emit("session.started", session);
        break;
      case "updated":
        await this.saveSessionWrapper(ev);
        break;
      case "removed":
        if (!this.sessions[ev.record.sessionId]) return;
        delete this.sessions[ev.record.sessionId];
        break;
    }
  }

  private async lock<T = any>(sessionId: string, fn: () => Promise<any>) {
    // eslint-disable-next-line no-async-promise-executor
    this.locks[sessionId] = new Promise<T>(async (resolve, reject) => {
      try {
        resolve(await fn());
      } catch (e) {
        reject(e);
      }
    });
    try {
      const res = await this.locks[sessionId];
      return res;
    } catch (e) {
      if (e instanceof Error) this.logger.error(`lock failure: ${e.stack}`);
      return null;
    } finally {
      delete this.locks[sessionId];
    }
  }

  async loadSessionWrapper<SessionWrapper extends BaseSessionWrapper>(context: {
    sessionId: string;
    appId?: string;
    userId?: string;
  }): Promise<SessionWrapper> {
    const opId = `[${performance.now()}] `;
    if (await this.locks[context.sessionId]) {
      this.logger.debug(`${opId} Wait lock for sessionId=${context.sessionId}`);
      await this.locks[context.sessionId];
      this.logger.debug(
        `${opId} Lock released for sessionId=${context.sessionId}`,
      );
    }

    return await this.lock<SessionWrapper>(context.sessionId, async () => {
      this.logger.debug(
        `${opId} Loading wrapper for sessionId=${context.sessionId}`,
      );
      const records = await this.sermas.findRecords({
        appId: "",
        sessionId: [context.sessionId],
        userId: undefined,
      });

      if (records && records.length) {
        this.logger.debug(
          `${opId} Wrapper exists for sessionId=${context.sessionId}`,
        );
        return records[0].data as SessionWrapper;
      } else {
        this.logger.debug(
          `${opId} Wrapper not found for sessionId=${context.sessionId}`,
        );
      }

      this.logger.debug(
        `${opId} Creating new session wrapper store sessionId=${context.sessionId} appId=${context.appId} userId=${context.userId}`,
      );

      const storageId = uuidv4();
      const sessionWrapper = {
        ...context,
        appId: context.appId,
        sessionId: context.sessionId,
        userId: context.userId,
        storageId,
      };

      if (!sessionWrapper.appId || !sessionWrapper.userId) {
        this.logger.debug(
          `${opId} Load session record sessionId=${sessionWrapper.sessionId}`,
        );
        const session = await this.sermas.readSession(sessionWrapper.sessionId);
        if (session) {
          if (!sessionWrapper.appId) sessionWrapper.appId = session.appId;
          if (!sessionWrapper.userId) sessionWrapper.userId = session.userId;
        } else {
          this.logger.warn(
            `${opId} Failed to load sessionId=${sessionWrapper.sessionId}`,
          );
        }
      }

      const record: SessionStorageRecordDto = {
        appId: sessionWrapper.appId!,
        sessionId: sessionWrapper.sessionId,
        data: sessionWrapper,
        userId: sessionWrapper.userId || undefined,
        storageId,
      };

      await this.sermas.setRecord(record);
      this.logger.debug(
        `${opId} Saved store storageId=${record.storageId} for sessionId=${record.sessionId} appId=${record.appId} userId=${record.userId}`,
      );

      return sessionWrapper;
    });
  }

  async getSession(sessionId: string) {
    return await this.sermas.client.api.session.readSession({ sessionId });
  }

  async updateSession(session: any) {
    return await this.sermas.client.api.session.updateSession({
      requestBody: session,
    });
  }

  async saveSession<SessionWrapper extends BaseSessionWrapper>(
    session: SessionWrapper,
  ): Promise<SessionWrapper | null> {
    let record = await this.sermas.getRecord(session.storageId);
    if (!record) {
      this.logger.warn(
        `sessionId=${session.sessionId} storageId=${session.storageId} not found, creating new record`,
      );
      const newSession = await this.loadSessionWrapper({ ...session });
      record = await this.sermas.getRecord(newSession.storageId);
    }

    if (!record) {
      this.logger.error(
        `Cannot save sessionId=${session.sessionId}, storage not found`,
      );
      return null;
    }

    record.data = {
      ...session,
      storageId: record.storageId,
    } as SessionWrapper;

    const res = await this.sermas.setRecord(record);
    this.logger.debug(
      `Saved record for sessionId=${record.sessionId} storageId=${record.storageId}`,
    );
    return res?.data as SessionWrapper;
  }

  async getSessionWrapper(
    sessionId: string,
  ): Promise<BaseSessionWrapper | undefined> {
    if (!sessionId) {
      this.logger.debug(`sessionId is empty`);
      return;
    }

    if (!this.sessions[sessionId]) {
      const session = await this.loadSessionWrapper({
        sessionId,
      });
      this.logger.debug(`loaded sessionId=${sessionId}`);
      this.sessions[sessionId] = session;
    }
    return this.sessions[sessionId] as BaseSessionWrapper;
  }

  async saveSessionWrapper(ev: SessionChangedDto) {
    if (!ev.appId) return;
    if (!ev.record.sessionId) return;

    if (this.sessions[ev.record.sessionId]) return;

    const wrapper = await this.loadSessionWrapper({
      userId: ev.userId,
      appId: ev.appId,
      sessionId: ev.record.sessionId,
    });

    this.sessions[wrapper.sessionId] = wrapper;
    this.logger.debug(`Added session ${wrapper.sessionId}`);

    return this.sessions[wrapper.sessionId];
  }
}

export { Store };
