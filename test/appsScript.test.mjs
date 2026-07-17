import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const scriptSource = readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");

describe("syncPiyologTextExports", () => {
  it("posts the latest text export and trashes older text files after success", () => {
    const oldTextFile = fakeFile({
      id: "old-file-id",
      name: "old.txt",
      mimeType: "text/plain",
      lastUpdated: "2026-06-22T00:00:00.000Z",
      text: "old text",
    });
    const latestTextFile = fakeFile({
      id: "latest-file-id",
      name: "latest.txt",
      mimeType: "text/plain",
      lastUpdated: "2026-06-22T00:05:00.000Z",
      text: "latest text",
    });
    const pdfFile = fakeFile({
      id: "pdf-file-id",
      name: "report.pdf",
      mimeType: "application/pdf",
      lastUpdated: "2026-06-22T00:10:00.000Z",
      text: "not text",
    });
    const { context, fetch, properties } = loadAppsScript([oldTextFile, latestTextFile, pdfFile]);

    context.syncPiyologTextExports();

    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe("https://worker.example.com/api/text-records?token=ingest-token");
    expect(JSON.parse(request.payload)).toEqual({
      source: "google_drive_text_export",
      fileId: "latest-file-id",
      fileName: "latest.txt",
      updatedAt: "2026-06-22T00:05:00.000Z",
      text: "latest text",
    });
    expect(properties.get("LAST_PROCESSED_FILE_KEY")).toBe(
      "latest-file-id:2026-06-22T00:05:00.000Z",
    );
    expect(oldTextFile.setTrashed).toHaveBeenCalledWith(true);
    expect(latestTextFile.setTrashed).not.toHaveBeenCalled();
    expect(pdfFile.setTrashed).not.toHaveBeenCalled();
  });

  it("trashes older text files even when the latest export was already processed", () => {
    const oldTextFile = fakeFile({
      id: "old-file-id",
      name: "old.txt",
      mimeType: "text/plain",
      lastUpdated: "2026-06-22T00:00:00.000Z",
      text: "old text",
    });
    const latestTextFile = fakeFile({
      id: "latest-file-id",
      name: "latest.txt",
      mimeType: "text/plain",
      lastUpdated: "2026-06-22T00:05:00.000Z",
      text: "latest text",
    });
    const { context, fetch } = loadAppsScript([oldTextFile, latestTextFile], {
      LAST_PROCESSED_FILE_KEY: "latest-file-id:2026-06-22T00:05:00.000Z",
    });

    context.syncPiyologTextExports();

    expect(fetch).not.toHaveBeenCalled();
    expect(oldTextFile.setTrashed).toHaveBeenCalledWith(true);
    expect(latestTextFile.setTrashed).not.toHaveBeenCalled();
  });

  it("does not trash older text files when the Worker request fails", () => {
    const oldTextFile = fakeFile({
      id: "old-file-id",
      name: "old.txt",
      mimeType: "text/plain",
      lastUpdated: "2026-06-22T00:00:00.000Z",
      text: "old text",
    });
    const latestTextFile = fakeFile({
      id: "latest-file-id",
      name: "latest.txt",
      mimeType: "text/plain",
      lastUpdated: "2026-06-22T00:05:00.000Z",
      text: "latest text",
    });
    const { context, properties } = loadAppsScript([oldTextFile, latestTextFile], {}, {
      status: 500,
      text: "database unavailable",
    });

    expect(() => context.syncPiyologTextExports()).toThrow(
      "Worker request failed: 500 database unavailable",
    );
    expect(properties.get("LAST_PROCESSED_FILE_KEY")).toBeUndefined();
    expect(oldTextFile.setTrashed).not.toHaveBeenCalled();
    expect(latestTextFile.setTrashed).not.toHaveBeenCalled();
  });

  it("attempts to trash every older text file before reporting trash failures", () => {
    const failingOldTextFile = fakeFile({
      id: "failing-old-file-id",
      name: "failing-old.txt",
      mimeType: "text/plain",
      lastUpdated: "2026-06-22T00:00:00.000Z",
      text: "failing old text",
    });
    const otherOldTextFile = fakeFile({
      id: "other-old-file-id",
      name: "other-old.txt",
      mimeType: "text/plain",
      lastUpdated: "2026-06-22T00:01:00.000Z",
      text: "other old text",
    });
    const latestTextFile = fakeFile({
      id: "latest-file-id",
      name: "latest.txt",
      mimeType: "text/plain",
      lastUpdated: "2026-06-22T00:05:00.000Z",
      text: "latest text",
    });
    failingOldTextFile.setTrashed.mockImplementation(() => {
      throw new Error("permission denied");
    });
    const { context, properties } = loadAppsScript([
      failingOldTextFile,
      otherOldTextFile,
      latestTextFile,
    ]);

    expect(() => context.syncPiyologTextExports()).toThrow(
      "Failed to trash old text files: failing-old.txt: permission denied",
    );
    expect(properties.get("LAST_PROCESSED_FILE_KEY")).toBe(
      "latest-file-id:2026-06-22T00:05:00.000Z",
    );
    expect(failingOldTextFile.setTrashed).toHaveBeenCalledWith(true);
    expect(otherOldTextFile.setTrashed).toHaveBeenCalledWith(true);
    expect(latestTextFile.setTrashed).not.toHaveBeenCalled();
  });
});

function loadAppsScript(files, initialProperties = {}, fetchResponse = { status: 200, text: "" }) {
  const properties = new Map([
    ["PIYOLOG_FOLDER_ID", "folder-id"],
    ["WORKER_TEXT_ENDPOINT", "https://worker.example.com/api/text-records"],
    ["INGEST_TOKEN", "ingest-token"],
    ...Object.entries(initialProperties),
  ]);
  const fetch = vi.fn(() => ({
    getResponseCode: () => fetchResponse.status,
    getContentText: () => fetchResponse.text,
  }));
  const context = {
    MimeType: {
      PLAIN_TEXT: "text/plain",
    },
    DriveApp: {
      getFolderById: (folderId) => {
        expect(folderId).toBe("folder-id");
        return fakeFolder(files);
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => properties.get(key) ?? null,
        setProperty: (key, value) => properties.set(key, value),
      }),
    },
    UrlFetchApp: {
      fetch,
    },
  };
  vm.createContext(context);
  vm.runInContext(scriptSource, context);

  return { context, fetch, properties };
}

function fakeFolder(files) {
  return {
    getFiles: () => {
      let index = 0;
      return {
        hasNext: () => index < files.length,
        next: () => files[index++],
      };
    },
  };
}

function fakeFile({ id, name, mimeType, lastUpdated, text }) {
  return {
    getId: () => id,
    getName: () => name,
    getMimeType: () => mimeType,
    getLastUpdated: () => new Date(lastUpdated),
    getBlob: () => ({
      getDataAsString: (encoding) => {
        expect(encoding).toBe("UTF-8");
        return text;
      },
    }),
    setTrashed: vi.fn(),
  };
}
