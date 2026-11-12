use serde::Deserialize;
use serde_json::Value;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

#[derive(Deserialize)]
pub(crate) struct Statement {
    sql: String,
    values: Vec<Value>,
}

#[tauri::command]
pub(crate) async fn planner_sqlite_write_batch(
    instances: State<'_, DbInstances>,
    statements: Vec<Statement>,
) -> Result<(), String> {
    let pool = {
        let instances = instances.0.read().await;
        match instances.get("sqlite:tongyun_planner.db") {
            Some(DbPool::Sqlite(pool)) => pool.clone(),
            _ => return Err("Planner SQLite is unavailable".into()),
        }
    };
    write_batch(&pool, statements).await
}

async fn write_batch(pool: &sqlx::SqlitePool, statements: Vec<Statement>) -> Result<(), String> {
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| error.to_string())?;
    for statement in statements {
        let kind = statement.sql.split_whitespace().next().unwrap_or_default();
        if !["INSERT", "UPDATE", "DELETE"].contains(&kind) || statement.sql.contains(';') {
            return Err("Unsupported Planner batch statement".into());
        }
        let mut query = sqlx::query(&statement.sql);
        for value in statement.values {
            query = match value {
                Value::Null => query.bind(None::<String>),
                Value::String(value) => query.bind(value),
                Value::Bool(value) => query.bind(value),
                Value::Number(value) => match value.as_i64() {
                    Some(number) => query.bind(number),
                    None => query.bind(value.as_f64()),
                },
                _ => return Err("Unsupported Planner batch parameter".into()),
            };
        }
        query
            .execute(&mut *tx)
            .await
            .map_err(|error| error.to_string())?;
    }
    tx.commit().await.map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failed_batch_rolls_back_earlier_writes() {
        tauri::async_runtime::block_on(async {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .unwrap();
            sqlx::query("CREATE TABLE sample (id INTEGER PRIMARY KEY)")
                .execute(&pool)
                .await
                .unwrap();
            let insert = || Statement {
                sql: "INSERT INTO sample VALUES ($1)".into(),
                values: vec![1.into()],
            };
            assert!(write_batch(&pool, vec![insert(), insert()]).await.is_err());
            let count: i64 = sqlx::query_scalar("SELECT count(*) FROM sample")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(count, 0);
            write_batch(&pool, vec![insert()]).await.unwrap();
        });
    }
}
