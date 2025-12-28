// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;

// Data structure coming FROM React
#[derive(Deserialize, Debug)]
struct HttpRequest {
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: String,
}

// Data structure sent BACK to React
#[derive(Serialize, Debug)]
struct HttpResponse {
    status: u16,
    status_text: String,
    headers: HashMap<String, String>,
    body: String,
    duration: u128, // milliseconds
}

#[tauri::command]
async fn send_request(request: HttpRequest) -> Result<HttpResponse, String> {
    let client = reqwest::Client::new();

    let method = match request.method.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        _ => return Err("Invalid HTTP Method".into()),
    };

    let start_time = Instant::now();
    
    // Start building the request
    let mut builder = client.request(method, &request.url);

    // Add headers
    for (k, v) in &request.headers {
        builder = builder.header(k, v);
    }

    // Add body if it exists
    if !request.body.is_empty() {
        // Simple check: if it looks like JSON, send as JSON, otherwise text
        builder = builder.header("Content-Type", "application/json");
        builder = builder.body(request.body);
    }

    // Send the request
    let response = builder.send().await.map_err(|e| e.to_string())?;
    
    // Measure time
    let duration = start_time.elapsed().as_millis();
    
    let status = response.status().as_u16();
    let status_text = response.status().to_string();

    // Parse response headers
    let mut headers_map = HashMap::new();
    for (k, v) in response.headers() {
        headers_map.insert(k.to_string(), v.to_str().unwrap_or("").to_string());
    }

    // Parse body text
    let body_text = response.text().await.map_err(|e| e.to_string())?;

    Ok(HttpResponse {
        status,
        status_text,
        headers: headers_map,
        body: body_text,
        duration,
    })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![send_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}