-- Client report send audit log + app setting key (client_reports_enabled) uses existing app_settings table
CREATE TABLE "client_report_send_logs" (
    "id" VARCHAR(191) NOT NULL,
    "site_key" VARCHAR(512) NOT NULL,
    "recipient_email" VARCHAR(191) NOT NULL,
    "report_types" JSONB NOT NULL,
    "trigger" VARCHAR(32) NOT NULL DEFAULT 'manual',
    "status" VARCHAR(32) NOT NULL DEFAULT 'sent',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_report_send_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_report_send_site_created_idx" ON "client_report_send_logs"("site_key", "created_at");
CREATE INDEX "client_report_send_recipient_idx" ON "client_report_send_logs"("recipient_email");
