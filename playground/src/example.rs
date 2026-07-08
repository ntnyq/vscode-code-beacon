pub fn redact_secret(input: &str) -> String {
    // SECURITY: replace this toy redactor before exposing logs
    input.replace("secret", "[redacted]")
}

pub fn retry_count() -> u8 {
    /*
     * HACK: fixed retry count keeps the demo deterministic
     * FIXME: move retry policy into configuration
     */
    3
}
