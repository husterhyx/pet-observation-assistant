import { isTauri } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const BACKUP_FILTER = [{ name: "宠物观察备份", extensions: ["json"] }];

export function backupFileName() {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  return `pet-observation-backup-${stamp}.json`;
}

export async function saveBackupText(contents: string) {
  const filename = backupFileName();
  if (isTauri()) {
    const path = await saveDialog({ defaultPath: filename, filters: BACKUP_FILTER });
    if (!path) return false;
    await writeTextFile(path, contents);
    return true;
  }

  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

export async function pickBackupText() {
  if (isTauri()) {
    const path = await openDialog({ multiple: false, directory: false, filters: BACKUP_FILTER });
    if (!path || Array.isArray(path)) return null;
    return readTextFile(path);
  }

  return new Promise<string | null>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.oncancel = () => resolve(null);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > 256 * 1024 * 1024) return reject(new Error("备份文件不能超过 256 MiB"));
      file.text().then(resolve, reject);
    };
    input.click();
  });
}
