import * as fs from "node:fs/promises";
import { Logger } from "@sermas/api-client";

import { randomUUID } from "node:crypto";

export const uuidv4 = () => randomUUID();

const logger = new Logger("util");

export const saveJSON = (filename: string, dataset: Record<string, unknown>) =>
  fs.writeFile(filename, JSON.stringify(dataset, null, 2));

export const loadJSON = async <T = Record<string, unknown>>(
  filename: string,
) => {
  try {
    const raw = await loadFile(filename);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch (e: unknown) {
    if (e instanceof Error) logger.error(`Failed to load dataset: ${e.stack}`);
    return null;
  }
};

export const loadFile = async (filename: string) => {
  try {
    const raw = await fs.readFile(filename);
    return raw.toString();
  } catch (e: unknown) {
    if (e instanceof Error) logger.error(`Failed to load dataset: ${e.stack}`);
    return null;
  }
};

export const saveFile = (filename: string, dataset: string | Buffer) =>
  fs.writeFile(filename, dataset);
