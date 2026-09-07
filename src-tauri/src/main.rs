#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod settings;
mod updater;

use std::time::Duration;
use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

const GITHUB_URL: &str = "https://github.com/davidzhanghui/awesome-mini-game";

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::set_settings,
            updater::get_app_version,
            updater::check_for_updates_now,
        ])
        .setup(|app| {
            build_app_menu(app)?;
            // 主窗口代码创建，以便挂载 on_navigation（http 外链转系统浏览器）
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Awesome Mini Game · 经典小游戏合集")
                .inner_size(1280.0, 800.0)
                .min_inner_size(960.0, 640.0)
                .center()
                .resizable(true)
                .on_navigation(handle_navigation)
                .build()?;
            // 启动时按偏好自动检查更新（后台线程，避免阻塞主线程）
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(3));
                if settings::load(&handle).check_on_startup {
                    tauri::async_runtime::block_on(updater::check_and_prompt(&handle, false));
                }
            });
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            match id {
                "check-for-updates" => {
                    let handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        updater::check_and_prompt(&handle, true).await;
                    });
                }
                "open-settings" => open_aux_window(app, "settings", "desktop/settings.html", "偏好设置", 430.0, 360.0, false),
                "open-about" => open_aux_window(app, "about", "desktop/about.html", "关于 Awesome Mini Game", 500.0, 640.0, false),
                "open-github" => {
                    let _ = app.opener().open_url(GITHUB_URL, None::<&str>);
                }
                "go-home" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.eval("window.location.assign('index.html')");
                    }
                }
                "reload-main" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.reload();
                    }
                }
                "toggle-fullscreen" => {
                    if let Some(w) = app.get_webview_window("main") {
                        if let Ok(full) = w.is_fullscreen() {
                            let _ = w.set_fullscreen(!full);
                        }
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("Tauri 应用启动失败");
}

/// 网页里的 http(s) 外链（GitHub 图标等）用系统浏览器打开，不在应用内跳转。
/// 允许：tauri/asset 本地协议 + dev 调试用的 localhost。
fn handle_navigation(url: &tauri::Url) -> bool {
    let scheme = url.scheme();
    if scheme == "tauri" || scheme == "asset" {
        return true;
    }
    if scheme == "http" || scheme == "https" {
        if let Some(host) = url.host_str() {
            if host == "localhost" || host == "127.0.0.1" || host == "[::1]" {
                return true;
            }
        }
        open_external_url(url.as_str());
        return false;
    }
    false
}

/// 跨平台：用系统默认浏览器打开外链（macOS open / Windows start / Linux xdg-open）。
fn open_external_url(url: &str) {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}

/// macOS 标准应用菜单：App / 文件 / 编辑 / 显示 / 窗口 / 帮助
fn build_app_menu(app: &tauri::App) -> tauri::Result<()> {
    let version = env!("CARGO_PKG_VERSION");

    let about_metadata = AboutMetadataBuilder::new()
        .name(Some("Awesome Mini Game".to_string()))
        .version(Some(version.to_string()))
        .short_version(Some(version.to_string()))
        .authors(Some(vec!["davidzhanghui".to_string()]))
        .comments(Some(
            "14 款纯原生 JS 经典小游戏合集：俄罗斯方块、2048、扫雷、雷电、坦克大战、马里奥、中国象棋、斗地主……离线可玩。"
                .to_string(),
        ))
        .copyright(Some("MIT License · 经典重制仅供学习交流".to_string()))
        .license(Some("MIT".to_string()))
        .website(Some(GITHUB_URL.to_string()))
        .website_label(Some("GitHub 仓库".to_string()))
        .build();

    // ---- App 菜单（macOS 下第一个 submenu 自动成为 App 菜单） ----
    let app_menu = SubmenuBuilder::new(app, "Awesome Mini Game")
        .item(&PredefinedMenuItem::about(
            app,
            Some("关于 Awesome Mini Game"),
            Some(about_metadata),
        )?)
        .separator()
        .item(&MenuItemBuilder::with_id("check-for-updates", "检查更新…").build(app)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("open-settings", "偏好设置…")
                .accelerator("CommandOrControl+,")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::services(app, Some("服务"))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some("隐藏 Awesome Mini Game"))?)
        .item(&PredefinedMenuItem::hide_others(app, Some("隐藏其他"))?)
        .item(&PredefinedMenuItem::show_all(app, Some("全部显示"))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("退出 Awesome Mini Game"))?)
        .build()?;

    // ---- 文件 ----
    let file_menu = SubmenuBuilder::new(app, "文件")
        .item(
            &MenuItemBuilder::with_id("go-home", "返回游戏库首页")
                .accelerator("CommandOrControl+1")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("关闭窗口"))?)
        .build()?;

    // ---- 编辑（原生行为：搜索框等输入框的撤销/剪贴全可用） ----
    let edit_menu = SubmenuBuilder::new(app, "编辑")
        .item(&PredefinedMenuItem::undo(app, Some("撤销"))?)
        .item(&PredefinedMenuItem::redo(app, Some("重做"))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some("剪切"))?)
        .item(&PredefinedMenuItem::copy(app, Some("拷贝"))?)
        .item(&PredefinedMenuItem::paste(app, Some("粘贴"))?)
        .item(&PredefinedMenuItem::select_all(app, Some("全选"))?)
        .build()?;

    // ---- 显示 ----
    let view_menu = SubmenuBuilder::new(app, "显示")
        .item(
            &MenuItemBuilder::with_id("reload-main", "重新载入")
                .accelerator("CommandOrControl+R")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("toggle-fullscreen", "切换全屏")
                .accelerator("Control+Command+F")
                .build(app)?,
        )
        .build()?;

    // ---- 窗口 ----
    let window_menu = SubmenuBuilder::new(app, "窗口")
        .item(&PredefinedMenuItem::minimize(app, Some("最小化"))?)
        .item(&PredefinedMenuItem::maximize(app, Some("缩放"))?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, Some("进入全屏"))?)
        .build()?;

    // ---- 帮助 ----
    let help_menu = SubmenuBuilder::new(app, "帮助")
        .item(&MenuItemBuilder::with_id("open-github", "GitHub 仓库").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("open-about", "关于 Awesome Mini Game").build(app)?)
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()?;

    app.set_menu(menu)?;
    Ok(())
}

/// 打开关于 / 设置等辅助窗口：已存在则聚焦，不重复创建。
fn open_aux_window(
    app: &AppHandle,
    label: &str,
    url: &str,
    title: &str,
    width: f64,
    height: f64,
    resizable: bool,
) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(width, height)
        .resizable(resizable)
        .minimizable(true)
        .maximizable(false)
        .center()
        .build();
}
