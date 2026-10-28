use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn scan_pdf(bytes: &[u8]) -> Result<JsValue, JsValue> {
    let report = pdf_hidden_text_remover_core::scan_pdf(bytes)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_wasm_bindgen::to_value(&report).map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen]
pub fn clean_pdf(bytes: &[u8], finding_ids: JsValue) -> Result<Vec<u8>, JsValue> {
    let ids: Vec<String> = serde_wasm_bindgen::from_value(finding_ids)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    pdf_hidden_text_remover_core::clean_pdf(bytes, &ids)
        .map_err(|error| JsValue::from_str(&error.to_string()))
}
