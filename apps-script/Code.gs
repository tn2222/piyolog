const PROPERTY_KEYS = {
  folderId: "PIYOLOG_FOLDER_ID",
  workerTextEndpoint: "WORKER_TEXT_ENDPOINT",
  ingestToken: "INGEST_TOKEN",
  lastProcessedFileKey: "LAST_PROCESSED_FILE_KEY",
};

function syncPiyologTextExports() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const folderId = getRequiredProperty(scriptProperties, PROPERTY_KEYS.folderId);
  const endpoint = getRequiredProperty(scriptProperties, PROPERTY_KEYS.workerTextEndpoint);
  const token = getRequiredProperty(scriptProperties, PROPERTY_KEYS.ingestToken);
  const folder = DriveApp.getFolderById(folderId);
  const textFiles = collectTextFiles(folder);
  const latestFile = textFiles.latestFile;

  if (latestFile === null) {
    return;
  }

  const updatedAt = latestFile.getLastUpdated().toISOString();
  const fileKey = `${latestFile.getId()}:${updatedAt}`;
  if (scriptProperties.getProperty(PROPERTY_KEYS.lastProcessedFileKey) !== fileKey) {
    postTextExport(endpoint, token, {
      source: "google_drive_text_export",
      fileId: latestFile.getId(),
      fileName: latestFile.getName(),
      updatedAt,
      text: latestFile.getBlob().getDataAsString("UTF-8"),
    });

    scriptProperties.setProperty(PROPERTY_KEYS.lastProcessedFileKey, fileKey);
  }

  trashFiles(textFiles.oldFiles);
}

function postTextExport(endpoint, token, payload) {
  const response = UrlFetchApp.fetch(withToken(endpoint, token), {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(`Worker request failed: ${status} ${response.getContentText()}`);
  }
}

function withToken(endpoint, token) {
  const separator = endpoint.indexOf("?") === -1 ? "?" : "&";
  return `${endpoint}${separator}token=${encodeURIComponent(token)}`;
}

function getRequiredProperty(scriptProperties, key) {
  const value = scriptProperties.getProperty(key);
  if (!value) {
    throw new Error(`Missing Script Property: ${key}`);
  }
  return value;
}

function isTextFile(file) {
  const name = file.getName().toLowerCase();
  const mimeType = file.getMimeType();
  return name.endsWith(".txt") || mimeType === MimeType.PLAIN_TEXT;
}

function findLatestTextFile(folder) {
  return collectTextFiles(folder).latestFile;
}

function collectTextFiles(folder) {
  const files = folder.getFiles();
  let latestFile = null;
  const oldFiles = [];

  while (files.hasNext()) {
    const file = files.next();
    if (!isTextFile(file)) {
      continue;
    }

    if (latestFile === null) {
      latestFile = file;
      continue;
    }

    if (file.getLastUpdated() > latestFile.getLastUpdated()) {
      oldFiles.push(latestFile);
      latestFile = file;
      continue;
    }

    oldFiles.push(file);
  }

  return { latestFile, oldFiles };
}

function trashFiles(files) {
  const failures = [];

  files.forEach((file) => {
    try {
      file.setTrashed(true);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      failures.push(`${file.getName()}: ${message}`);
    }
  });

  if (failures.length > 0) {
    throw new Error(`Failed to trash old text files: ${failures.join("; ")}`);
  }
}
