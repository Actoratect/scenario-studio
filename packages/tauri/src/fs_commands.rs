// adapter-tauri (TS 側) が呼ぶ ss_fs_* コマンド群の Rust 実装。
// 詳細: ../../../Documentation/ScenarioEditor/12_architecture.md §1, §3.2,
//       ../../../Documentation/ScenarioEditor/16_security.md §3, §4.3 (path traversal)

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

/// ProjectHandle ID → 絶対ルートパスを保持する。
/// ハンドルは Browser/Tauri/Unity で「不透明」契約 (TS 側が ID 文字列だけ握る)。
pub struct FsHandles(pub Mutex<HashMap<String, PathBuf>>);

impl Default for FsHandles {
    fn default() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RegisterArgs {
    pub absolute_root: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RegisterReply {
    pub id: String,
    pub name: String,
}

/// プロジェクトルートを登録し、不透明な Handle ID を返す。
/// PoC-G スコープ: ファイルピッカー (tauri-plugin-dialog) との連携は Phase 3 で。
#[tauri::command]
pub fn ss_fs_register(
    args: RegisterArgs,
    handles: State<'_, FsHandles>,
) -> Result<RegisterReply, String> {
    let path = PathBuf::from(&args.absolute_root);
    if !path.is_absolute() {
        return Err(format!("absoluteRoot must be absolute: {}", args.absolute_root));
    }
    let id = uuid_like();
    handles
        .0
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?
        .insert(id.clone(), path);
    Ok(RegisterReply { id, name: args.name })
}

#[derive(Debug, Deserialize)]
pub struct PathArgs {
    #[serde(rename = "handleId")]
    pub handle_id: String,
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct ListArgs {
    #[serde(rename = "handleId")]
    pub handle_id: String,
    pub glob: String,
}

#[derive(Debug, Deserialize)]
pub struct WriteArgs {
    #[serde(rename = "handleId")]
    pub handle_id: String,
    pub path: String,
    pub data: String,
}

#[derive(Debug, Deserialize)]
pub struct WriteBytesArgs {
    #[serde(rename = "handleId")]
    pub handle_id: String,
    pub path: String,
    pub data: Vec<u8>,
}

#[tauri::command]
pub fn ss_fs_list(args: ListArgs, handles: State<'_, FsHandles>) -> Result<Vec<String>, String> {
    let root = resolve_root(&args.handle_id, &handles)?;
    let pattern = root.join(&args.glob);
    let pattern_str = pattern
        .to_str()
        .ok_or_else(|| "non-UTF-8 pattern".to_string())?;
    let mut out = Vec::new();
    for entry in glob::glob(pattern_str).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if let Ok(rel) = entry.strip_prefix(&root) {
            // POSIX 区切りに正規化 (TS 側の interface に合わせる)
            let s = rel.to_string_lossy().replace('\\', "/");
            out.push(s);
        }
    }
    out.sort();
    Ok(out)
}

#[tauri::command]
pub fn ss_fs_read(args: PathArgs, handles: State<'_, FsHandles>) -> Result<String, String> {
    let abs = to_abs(&args.handle_id, &args.path, &handles)?;
    std::fs::read_to_string(&abs).map_err(|e| format!("read {}: {e}", abs.display()))
}

#[tauri::command]
pub fn ss_fs_read_bytes(args: PathArgs, handles: State<'_, FsHandles>) -> Result<Vec<u8>, String> {
    let abs = to_abs(&args.handle_id, &args.path, &handles)?;
    std::fs::read(&abs).map_err(|e| format!("readBytes {}: {e}", abs.display()))
}

#[tauri::command]
pub fn ss_fs_write(args: WriteArgs, handles: State<'_, FsHandles>) -> Result<(), String> {
    let abs = to_abs(&args.handle_id, &args.path, &handles)?;
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    }
    std::fs::write(&abs, args.data).map_err(|e| format!("write {}: {e}", abs.display()))
}

#[tauri::command]
pub fn ss_fs_write_bytes(args: WriteBytesArgs, handles: State<'_, FsHandles>) -> Result<(), String> {
    let abs = to_abs(&args.handle_id, &args.path, &handles)?;
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    }
    std::fs::write(&abs, args.data).map_err(|e| format!("writeBytes {}: {e}", abs.display()))
}

#[tauri::command]
pub fn ss_fs_delete(args: PathArgs, handles: State<'_, FsHandles>) -> Result<(), String> {
    let abs = to_abs(&args.handle_id, &args.path, &handles)?;
    if !abs.exists() {
        return Ok(());
    }
    std::fs::remove_file(&abs).map_err(|e| format!("delete {}: {e}", abs.display()))
}

#[tauri::command]
pub fn ss_fs_exists(args: PathArgs, handles: State<'_, FsHandles>) -> Result<bool, String> {
    let abs = to_abs(&args.handle_id, &args.path, &handles)?;
    Ok(abs.exists())
}

// ===== ヘルパ =====

fn resolve_root(handle_id: &str, handles: &State<'_, FsHandles>) -> Result<PathBuf, String> {
    handles
        .0
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?
        .get(handle_id)
        .cloned()
        .ok_or_else(|| format!("Unknown ProjectHandle: {handle_id}"))
}

fn to_abs(
    handle_id: &str,
    rel: &str,
    handles: &State<'_, FsHandles>,
) -> Result<PathBuf, String> {
    assert_safe_path(rel)?;
    let root = resolve_root(handle_id, handles)?;
    Ok(root.join(rel))
}

/// TS 側 `assertSafePath()` (core/src/platform.ts) の Rust 版。
/// 双方の入口で同等の防御を行う方針。
fn assert_safe_path(p: &str) -> Result<(), String> {
    if p.is_empty() {
        return Err("Invalid path: empty".into());
    }
    if p.contains('\0') {
        return Err("Invalid path: null byte".into());
    }
    if p.contains('\\') {
        return Err("Invalid path: use POSIX `/` separator".into());
    }
    if Path::new(p).is_absolute() || p.starts_with('/') {
        return Err("Invalid path: absolute path".into());
    }
    if p.len() >= 2 {
        let bytes = p.as_bytes();
        if bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
            return Err("Invalid path: Windows drive letter".into());
        }
    }
    for seg in p.split('/') {
        match seg {
            ".." => return Err("Invalid path: parent traversal `..`".into()),
            "." => return Err("Invalid path: `.` segment".into()),
            "" => return Err("Invalid path: empty segment".into()),
            _ => {}
        }
    }
    Ok(())
}

/// 簡易 UUID 風 ID。Phase 3 で uuid クレートに置換予定。
fn uuid_like() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("h-{nanos:032x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_path_accepts_relative() {
        assert!(assert_safe_path("Nodes/Character/tarou.yaml").is_ok());
    }

    #[test]
    fn safe_path_rejects_traversal() {
        assert!(assert_safe_path("..").is_err());
        assert!(assert_safe_path("Nodes/../etc/passwd").is_err());
    }

    #[test]
    fn safe_path_rejects_absolute_and_drive() {
        assert!(assert_safe_path("/abs/path").is_err());
        assert!(assert_safe_path("C:/foo").is_err());
        assert!(assert_safe_path("c:\\foo").is_err());
    }

    #[test]
    fn safe_path_rejects_backslash_and_null() {
        assert!(assert_safe_path("Nodes\\Character").is_err());
        assert!(assert_safe_path("a\0b").is_err());
    }
}
