use lettre::{
    transport::smtp::authentication::{Credentials, Mechanism},
    message::{header::ContentType, SinglePart},
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct SmtpConfig {
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_user: String,
    pub smtp_pass: String,
    pub recipient_email: String,
}

#[tauri::command]
pub async fn send_test_email(config: SmtpConfig) -> Result<String, String> {
    let email = Message::builder()
        .from(format!("橦云手帐 <{}>", config.smtp_user)
            .parse()
            .map_err(|e| format!("无效发件人地址: {}", e))?)
        .to(config.recipient_email
            .parse()
            .map_err(|e| format!("无效收件人地址: {}", e))?)
        .subject("📧 橦云手帐 · SMTP 配置测试")
        .singlepart(SinglePart::builder()
            .header(ContentType::TEXT_HTML)
            .body(r#"<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:'Georgia','Noto Serif SC','PingFang SC','Microsoft YaHei',serif">
  <table align="center" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:100%;background:#FFFFFF;border-radius:16px;border:1px solid #EFEBE4;box-shadow:0 4px 20px rgba(154,142,128,0.10);overflow:hidden">

        <!-- 顶部装饰条 -->
        <tr><td style="height:4px;background:linear-gradient(90deg,#C4D7B2,#E8A0BF,#B2C8DF)"></td></tr>

        <!-- 标题区 -->
        <tr><td style="padding:36px 40px 12px;text-align:center">
          <div style="font-size:32px;margin-bottom:8px">📮</div>
          <h1 style="margin:0;font-size:20px;color:#2D323A;font-weight:700;letter-spacing:1px">
            邮件配置测试
          </h1>
          <p style="margin:8px 0 0;font-size:13px;color:#64748B">
             这是一封来自 <strong style="color:#4D7C5D">橦云手帐</strong> 的测试邮件
          </p>
        </td></tr>

        <!-- 分割线 -->
        <tr><td style="padding:0 40px"><div style="height:1px;background:linear-gradient(90deg,transparent,#EFEBE4,transparent)"></div></td></tr>

        <!-- 成功卡片 -->
        <tr><td style="padding:24px 40px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F5F1;border-radius:12px;border:1px solid #DEEAE2">
            <tr><td style="padding:20px;text-align:center">
              <div style="font-size:40px;line-height:1">✅</div>
              <h2 style="margin:12px 0 4px;font-size:16px;color:#4D7C5D;font-weight:700">
                SMTP 配置成功
              </h2>
              <p style="margin:0;font-size:13px;color:#5C7A6A;line-height:1.6">
                如果收到这封邮件，说明 SMTP 配置正确，测试发送可用
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- 提示信息 -->
        <tr><td style="padding:0 40px 8px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF5ED;border-radius:12px;border:1px solid #EFE5D3">
            <tr><td style="padding:16px 20px">
              <p style="margin:0 0 6px;font-size:12px;color:#8B6E3C;font-weight:700">📌 当前状态</p>
              <ul style="margin:0;padding-left:18px;font-size:12px;color:#64748B;line-height:1.8">
                <li>SMTP 测试发送已可用</li>
                <li>到期/每日汇总自动邮件尚未实现</li>
                <li>任务提醒请使用应用内「系统通知」</li>
              </ul>
            </td></tr>
          </table>
        </td></tr>

        <!-- 底部装饰 -->
        <tr><td style="padding:28px 40px 36px;text-align:center">
          <div style="font-size:11px;color:#B8AC9E;letter-spacing:2px">✦ ✦ ✦</div>
          <p style="margin:10px 0 0;font-size:11px;color:#B8AC9E">
            TongYun Planner <span style="color:#C4D7B2">·</span> 橦云手帐
          </p>
          <p style="margin:4px 0 0;font-size:10px;color:#D5CDC4">
            你的四象限待办 · 番茄钟 · 手账本
          </p>
        </td></tr>

        <!-- 底部装饰条 -->
        <tr><td style="height:4px;background:linear-gradient(90deg,#B2C8DF,#E8A0BF,#C4D7B2)"></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"#.to_string(),
        ))
        .map_err(|e| format!("构建邮件失败: {}", e))?;

    let creds = Credentials::new(config.smtp_user.clone(), config.smtp_pass);

    let mailer = if config.smtp_port == 465 || config.smtp_port == 994 {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&config.smtp_host)
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.smtp_host)
    }
    .map_err(|e| format!("SMTP 连接失败: {}", e))?
    .port(config.smtp_port)
    .credentials(creds)
    .authentication(vec![Mechanism::Plain])
    .timeout(Some(std::time::Duration::from_secs(15)))
    .build();

    mailer
        .send(email)
        .await
        .map_err(|e| format!("发送失败: {}", e))?;

    Ok("✅ 测试邮件发送成功，请检查收件箱".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_smtp_config_deserialize_valid() {
        let json = r#"{
            "smtp_host": "smtp.example.com",
            "smtp_port": 465,
            "smtp_user": "test@example.com",
            "smtp_pass": "secret123",
            "recipient_email": "recipient@example.com"
        }"#;

        let config: SmtpConfig = serde_json::from_str(json).expect("should deserialize SmtpConfig");
        assert_eq!(config.smtp_host, "smtp.example.com");
        assert_eq!(config.smtp_port, 465);
        assert_eq!(config.smtp_user, "test@example.com");
        assert_eq!(config.smtp_pass, "secret123");
        assert_eq!(config.recipient_email, "recipient@example.com");
    }

    #[test]
    fn test_smtp_config_deserialize_missing_fields() {
        let json = r#"{
            "smtp_host": "smtp.example.com",
            "smtp_port": 587
        }"#;

        let result: Result<SmtpConfig, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_smtp_config_deserialize_invalid_port() {
        let json = r#"{
            "smtp_host": "smtp.example.com",
            "smtp_port": "invalid_port",
            "smtp_user": "user@example.com",
            "smtp_pass": "secret123",
            "recipient_email": "recipient@example.com"
        }"#;

        let result: Result<SmtpConfig, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_smtp_config_debug() {
        let config = SmtpConfig {
            smtp_host: "smtp.example.com".to_string(),
            smtp_port: 587,
            smtp_user: "user@example.com".to_string(),
            smtp_pass: "pass".to_string(),
            recipient_email: "recipient@example.com".to_string(),
        };

        let debug_str = format!("{:?}", config);
        assert!(debug_str.contains("smtp.example.com"));
        assert!(debug_str.contains("587"));
        assert!(debug_str.contains("user@example.com"));
    }

    #[test]
    fn test_credentials_new() {
        let creds = Credentials::new("user@example.com".to_string(), "pass".to_string());
        let creds_debug = format!("{:?}", creds);
        assert!(!creds_debug.is_empty());
    }

    #[test]
    fn test_email_mailbox_parsing() {
        let sender = format!("橦云手帐 <{}>", "test@example.com");
        let parsed_sender: Result<lettre::message::Mailbox, _> = sender.parse();
        assert!(parsed_sender.is_ok());

        let recipient = "target@example.com";
        let parsed_recipient: Result<lettre::message::Mailbox, _> = recipient.parse();
        assert!(parsed_recipient.is_ok());

        let empty = "";
        let parsed_empty: Result<lettre::message::Mailbox, _> = empty.parse();
        assert!(parsed_empty.is_err());

        let invalid = "invalid mailbox with spaces <not-an-email>";
        let parsed_invalid: Result<lettre::message::Mailbox, _> = invalid.parse();
        assert!(parsed_invalid.is_err());
    }

    #[test]
    fn test_email_message_builder() {
        let from_box: lettre::message::Mailbox =
            format!("橦云手帐 <{}>", "sender@example.com").parse().unwrap();
        let to_box: lettre::message::Mailbox = "recipient@example.com".parse().unwrap();

        let email = Message::builder()
            .from(from_box)
            .to(to_box)
            .subject("📧 橦云手帐 · SMTP 配置测试")
            .singlepart(
                SinglePart::builder()
                    .header(ContentType::TEXT_HTML)
                    .body("<!DOCTYPE html><html><body>Test</body></html>".to_string()),
            );

        assert!(email.is_ok());
    }
}

