use serde::Deserialize;
use serde_json::Value;
use sqlx::{Connection, SqliteConnection};
use tauri::Manager;

#[derive(Deserialize)]
struct SqlStatement {
    query: String,
    values: Vec<Value>,
}

#[tauri::command]
async fn execute_sql_transaction(
    app: tauri::AppHandle,
    statements: Vec<SqlStatement>,
) -> Result<(), String> {
    let database_path = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("pet-observation.db");
    let options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(database_path)
        .create_if_missing(true);
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| error.to_string())?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| error.to_string())?;

    for statement in statements {
        let mut query = sqlx::query(&statement.query);
        for value in statement.values {
            query = match value {
                Value::Null => query.bind(None::<String>),
                Value::Bool(value) => query.bind(value),
                Value::Number(value) if value.is_i64() => query.bind(value.as_i64().unwrap()),
                Value::Number(value) if value.is_u64() => {
                    query.bind(value.as_u64().unwrap() as i64)
                }
                Value::Number(value) => query.bind(value.as_f64().unwrap()),
                Value::String(value) => query.bind(value),
                _ => return Err("SQL transaction values must be scalar JSON values".into()),
            };
        }
        query
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        tauri_plugin_sql::Migration {
            version: 1,
            description: "create_initial_pet_tables",
            sql: include_str!("../../db/migrations/0001_local_sqlite.sql"),
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 2,
            description: "remove_remote_sync",
            sql: include_str!("../../db/migrations/0002_remove_remote_sync.sql"),
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![execute_sql_transaction])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:pet-observation.db", migrations)
                .build(),
        )
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
