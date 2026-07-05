-- Supports the notification.sms-delivery-poll reconciliation query
-- (WHERE channel = 'SMS' AND status = 'SENT' AND sent_at BETWEEN ...)
CREATE INDEX "notifications_channel_status_sent_at_idx" ON "notifications"("channel", "status", "sent_at");
