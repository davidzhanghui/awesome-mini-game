use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

use crate::settings;

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// About 页 / 菜单里的「检查更新」入口（用户手动触发，一定给反馈）。
#[tauri::command]
pub async fn check_for_updates_now(app: AppHandle) {
    check_and_prompt(&app, true).await;
}

/// 检查更新并用原生对话框引导下载安装。
/// manual=true（用户手动点）时：无更新/失败也要弹窗告知；
/// manual=false（启动自动检查）时：无更新/失败保持静默，只在有更新且未开启自动安装时询问。
pub async fn check_and_prompt(app: &AppHandle, manual: bool) {
    let current = app.package_info().version.to_string();

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            if manual {
                error_dialog(app, &format!("更新组件初始化失败：{e}"));
            }
            return;
        }
    };

    let update = match updater.check().await {
        Ok(u) => u,
        Err(e) => {
            if manual {
                error_dialog(app, &format!("检查更新失败：{e}\n\n请检查网络连接后重试。"));
            }
            return;
        }
    };

    let Some(update) = update else {
        if manual {
            app.dialog()
                .message(format!("当前已是最新版本（v{current}）。"))
                .title("检查更新")
                .kind(MessageDialogKind::Info)
                .blocking_show();
        }
        return;
    };

    let auto = !manual && settings::load(app).auto_install;
    if !auto {
        let mut notes = format!("发现新版本 v{}（当前 v{}）。", update.version, current);
        if let Some(body) = update.body.as_ref() {
            if !body.trim().is_empty() {
                notes.push_str(&format!("\n\n更新内容：\n{body}"));
            }
        }
        notes.push_str("\n\n是否下载并安装？");
        let yes = app
            .dialog()
            .message(notes)
            .title("发现新版本")
            .buttons(MessageDialogButtons::OkCancelCustom(
                "下载安装".to_string(),
                "稍后".to_string(),
            ))
            .blocking_show();
        if !yes {
            return;
        }
    }

    if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
        error_dialog(app, &format!("下载 / 安装更新失败：{e}"));
        return;
    }

    let restart = app
        .dialog()
        .message("新版本已安装，重启应用后生效。是否立即重启？")
        .title("更新完成")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "立即重启".to_string(),
            "稍后手动重启".to_string(),
        ))
        .blocking_show();
    if restart {
        app.restart();
    }
}

fn error_dialog(app: &AppHandle, msg: &str) {
    app.dialog()
        .message(msg.to_string())
        .title("更新")
        .kind(MessageDialogKind::Error)
        .blocking_show();
}
