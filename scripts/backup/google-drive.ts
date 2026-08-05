import { createSign } from "node:crypto";

/**
 * E8-F1（A155）：Google Drive 存取——手動 JWT（RS256）+ REST，不引入
 * googleapis 套件（比照 KB-022／KB-033 最小成本原則，Node 22 內建
 * crypto／fetch 已足夠）。憑證來自 GOOGLE_SERVICE_ACCOUNT_JSON（service
 * account 金鑰 JSON 全文，見 09_KNOWLEDGE_BASE.md 帳號設定紀錄）。
 */

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken(key: ServiceAccountKey): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key);
  const jwt = `${unsigned}.${base64url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!response.ok) {
    throw new Error(`取得 access token 失敗：HTTP ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

async function uploadFile(
  accessToken: string,
  folderId: string,
  filename: string,
  mimeType: string,
  content: Buffer,
): Promise<string> {
  const boundary = "health_devkit_backup_boundary";
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\ncontent-type: ${mimeType}\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!response.ok) {
    throw new Error(`上傳 ${filename} 失敗：HTTP ${response.status} ${await response.text()}`);
  }
  const uploaded = (await response.json()) as { id: string };
  return uploaded.id;
}

async function listFilesInFolder(
  accessToken: string,
  folderId: string,
): Promise<{ id: string; name: string }[]> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", `'${folderId}' in parents and trashed=false`);
  url.searchParams.set("fields", "files(id,name)");
  url.searchParams.set("pageSize", "1000");

  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    throw new Error(`列出資料夾內容失敗：HTTP ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { files: { id: string; name: string }[] };
  return body.files;
}

async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`刪除檔案 ${fileId} 失敗：HTTP ${response.status} ${await response.text()}`);
  }
}

export { deleteFile, getAccessToken, listFilesInFolder, uploadFile };
export type { ServiceAccountKey };
