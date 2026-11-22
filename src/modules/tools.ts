import type {
  AppToolsDTO,
  DialogueToolsRepositoryDto,
} from "@sermas/api-client";
import type { BaseSessionWrapper } from "../dto/session.js";
import { SermasApp } from "./sermas.js";

type ToolsSchemaValues = string | number | boolean | undefined;
type ToolsSchemaParameters = Record<string, ToolsSchemaValues>;

class Tools {
  private sermas: SermasApp;

  constructor(sermasApp: SermasApp) {
    this.sermas = sermasApp;
  }

  async reset(session: BaseSessionWrapper) {
    await this.sermas.setTools({
      appId: session.appId,
      sessionId: session.sessionId,
      repositoryId: session.sessionId,
      tools: [],
    });
  }

  async set(
    session: BaseSessionWrapper,
    repository: DialogueToolsRepositoryDto,
  ) {
    repository.sessionId = session.sessionId;
    repository.repositoryId =
      (session.repositoryId as string) || session.sessionId;
    await this.sermas.setTools(repository);
  }

  async add(
    session: BaseSessionWrapper,
    repository: DialogueToolsRepositoryDto,
  ) {
    repository.sessionId = session.sessionId;
    repository.repositoryId =
      (session.repositoryId as string) || session.sessionId;
    await this.sermas.addTools(repository);
  }

  getSchemaValues<T extends ToolsSchemaParameters = ToolsSchemaParameters>(
    tool: AppToolsDTO,
  ): T {
    const values: ToolsSchemaParameters = {};

    if (!tool.schema) return values as T;

    tool.schema.forEach((schema) => (values[schema.parameter] = schema.value));

    return values as T;
  }

  getSchemaValue(tool: AppToolsDTO, parameterName: string) {
    const values = this.getSchemaValues(tool);
    return values[parameterName];
  }
}

export { Tools };
