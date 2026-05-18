-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'pending');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'admin', 'operator', 'viewer');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('email_verification', 'password_reset');

-- CreateEnum
CREATE TYPE "NotificationLevel" AS ENUM ('info', 'warning', 'error', 'success');

-- CreateEnum
CREATE TYPE "StorageProviderType" AS ENUM ('local', 's3', 'b2');

-- CreateEnum
CREATE TYPE "BackupKind" AS ENUM ('database', 'panel_data', 'custom');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "ScheduleKind" AS ENUM ('retention_sweep', 'session_cleanup', 'custom');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('active', 'paused', 'failed');

-- CreateEnum
CREATE TYPE "NotifyChannelType" AS ENUM ('telegram', 'webhook', 'email');

-- CreateEnum
CREATE TYPE "MonitoringCheckKind" AS ENUM ('http_health', 'tcp_port', 'systemd_unit', 'postgres_ping', 'backup_age', 'disk_usage', 'memory_usage', 'cert_expiry', 'scheduled_task');

-- CreateEnum
CREATE TYPE "MonitoringSeverity" AS ENUM ('info', 'warning', 'error', 'critical');

-- CreateEnum
CREATE TYPE "MonitoringAlertStatus" AS ENUM ('firing', 'resolved');

-- CreateEnum
CREATE TYPE "ServerInstallStatus" AS ENUM ('pending', 'installing', 'install_failed', 'installed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","role")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfSecret" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "targetKind" TEXT,
    "targetId" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminNotification" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "level" "NotificationLevel" NOT NULL DEFAULT 'info',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "href" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "BackupTarget" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "provider" "StorageProviderType" NOT NULL,
    "bucket" TEXT,
    "prefix" TEXT DEFAULT '',
    "endpoint" TEXT,
    "region" TEXT,
    "localPath" TEXT,
    "credentials" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupSchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cron" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "kind" "BackupKind" NOT NULL,
    "source" TEXT,
    "targetId" TEXT NOT NULL,
    "retentionCount" INTEGER,
    "retentionDays" INTEGER,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "lastStatus" "BackupStatus",
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "BackupKind" NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'pending',
    "scheduleId" TEXT,
    "targetId" TEXT NOT NULL,
    "source" TEXT,
    "serverId" TEXT,
    "objectKey" TEXT,
    "sizeBytes" BIGINT,
    "checksum" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "ScheduleKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cron" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "ScheduleStatus" NOT NULL DEFAULT 'active',
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "NotifyChannelType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringCheck" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "kind" "MonitoringCheckKind" NOT NULL,
    "config" JSONB NOT NULL,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 60,
    "failureThreshold" INTEGER NOT NULL DEFAULT 2,
    "severity" "MonitoringSeverity" NOT NULL DEFAULT 'warning',
    "channelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastMessage" TEXT,
    "consecutiveFails" INTEGER NOT NULL DEFAULT 0,
    "consecutiveOks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringAlert" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "status" "MonitoringAlertStatus" NOT NULL,
    "severity" "MonitoringSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoringAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nest" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "author" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Egg" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "nestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "author" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "dockerImages" JSONB NOT NULL,
    "defaultDockerImage" TEXT NOT NULL,
    "startup" TEXT NOT NULL,
    "stopCommand" TEXT,
    "customFlags" JSONB NOT NULL DEFAULT '[]',
    "configFiles" JSONB NOT NULL DEFAULT '{}',
    "configStartup" JSONB NOT NULL DEFAULT '{}',
    "configLogs" JSONB NOT NULL DEFAULT '{}',
    "scriptInstall" TEXT,
    "scriptEntry" TEXT NOT NULL DEFAULT 'ash',
    "scriptContainer" TEXT NOT NULL DEFAULT 'alpine:3.19',
    "scriptIsPrivileged" BOOLEAN NOT NULL DEFAULT false,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fileDenylist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "forceOutgoingIp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Egg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EggVariable" (
    "id" TEXT NOT NULL,
    "eggId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "envVariable" TEXT NOT NULL,
    "defaultValue" TEXT,
    "userViewable" BOOLEAN NOT NULL DEFAULT true,
    "userEditable" BOOLEAN NOT NULL DEFAULT true,
    "rules" TEXT NOT NULL DEFAULT 'required|string|max:255',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EggVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Node" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fqdn" TEXT NOT NULL,
    "scheme" TEXT NOT NULL DEFAULT 'https',
    "port" INTEGER NOT NULL DEFAULT 8443,
    "publicAddress" TEXT,
    "location" TEXT,
    "maxMemoryMb" INTEGER NOT NULL,
    "maxDiskMb" INTEGER NOT NULL,
    "memoryOverallocate" INTEGER NOT NULL DEFAULT 0,
    "diskOverallocate" INTEGER NOT NULL DEFAULT 0,
    "daemonTokenIdentifier" TEXT NOT NULL,
    "daemonTokenHash" TEXT NOT NULL,
    "daemonVersion" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "maintenance" BOOLEAN NOT NULL DEFAULT false,
    "public" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "alias" TEXT,
    "port" INTEGER NOT NULL,
    "notes" TEXT,
    "serverId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "eggId" TEXT NOT NULL,
    "defaultAllocationId" TEXT,
    "memoryMb" INTEGER NOT NULL,
    "swapMb" INTEGER NOT NULL DEFAULT 0,
    "diskMb" INTEGER NOT NULL,
    "ioWeight" INTEGER NOT NULL DEFAULT 500,
    "cpuLimit" INTEGER NOT NULL DEFAULT 0,
    "threads" TEXT,
    "image" TEXT NOT NULL,
    "startupOverride" TEXT,
    "environment" JSONB NOT NULL DEFAULT '{}',
    "installStatus" "ServerInstallStatus" NOT NULL DEFAULT 'pending',
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "backupLimit" INTEGER NOT NULL DEFAULT 2,
    "databaseLimit" INTEGER NOT NULL DEFAULT 0,
    "allocationLimit" INTEGER NOT NULL DEFAULT 1,
    "lastKnownState" TEXT,
    "lastStateAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerVariable" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "eggVariableId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerVariable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "VerificationToken_userId_idx" ON "VerificationToken"("userId");

-- CreateIndex
CREATE INDEX "VerificationToken_expiresAt_idx" ON "VerificationToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminNotification_read_createdAt_idx" ON "AdminNotification"("read", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BackupTarget_name_key" ON "BackupTarget"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BackupSchedule_name_key" ON "BackupSchedule"("name");

-- CreateIndex
CREATE INDEX "BackupSchedule_enabled_nextRunAt_idx" ON "BackupSchedule"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "Backup_status_idx" ON "Backup"("status");

-- CreateIndex
CREATE INDEX "Backup_targetId_idx" ON "Backup"("targetId");

-- CreateIndex
CREATE INDEX "Backup_scheduleId_idx" ON "Backup"("scheduleId");

-- CreateIndex
CREATE INDEX "Backup_serverId_idx" ON "Backup"("serverId");

-- CreateIndex
CREATE INDEX "Backup_createdAt_idx" ON "Backup"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledTask_name_key" ON "ScheduledTask"("name");

-- CreateIndex
CREATE INDEX "ScheduledTask_enabled_nextRunAt_idx" ON "ScheduledTask"("enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationChannel_name_key" ON "NotificationChannel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringCheck_name_key" ON "MonitoringCheck"("name");

-- CreateIndex
CREATE INDEX "MonitoringCheck_enabled_idx" ON "MonitoringCheck"("enabled");

-- CreateIndex
CREATE INDEX "MonitoringAlert_checkId_status_idx" ON "MonitoringAlert"("checkId", "status");

-- CreateIndex
CREATE INDEX "MonitoringAlert_startedAt_idx" ON "MonitoringAlert"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Nest_uuid_key" ON "Nest"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "Nest_name_key" ON "Nest"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Egg_uuid_key" ON "Egg"("uuid");

-- CreateIndex
CREATE INDEX "Egg_nestId_idx" ON "Egg"("nestId");

-- CreateIndex
CREATE UNIQUE INDEX "Egg_nestId_name_key" ON "Egg"("nestId", "name");

-- CreateIndex
CREATE INDEX "EggVariable_eggId_idx" ON "EggVariable"("eggId");

-- CreateIndex
CREATE UNIQUE INDEX "EggVariable_eggId_envVariable_key" ON "EggVariable"("eggId", "envVariable");

-- CreateIndex
CREATE UNIQUE INDEX "Node_uuid_key" ON "Node"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "Node_name_key" ON "Node"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Node_fqdn_key" ON "Node"("fqdn");

-- CreateIndex
CREATE UNIQUE INDEX "Node_daemonTokenIdentifier_key" ON "Node"("daemonTokenIdentifier");

-- CreateIndex
CREATE INDEX "Node_public_idx" ON "Node"("public");

-- CreateIndex
CREATE INDEX "Allocation_nodeId_idx" ON "Allocation"("nodeId");

-- CreateIndex
CREATE INDEX "Allocation_serverId_idx" ON "Allocation"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "Allocation_nodeId_ip_port_key" ON "Allocation"("nodeId", "ip", "port");

-- CreateIndex
CREATE UNIQUE INDEX "Server_uuid_key" ON "Server"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "Server_identifier_key" ON "Server"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Server_defaultAllocationId_key" ON "Server"("defaultAllocationId");

-- CreateIndex
CREATE INDEX "Server_ownerId_idx" ON "Server"("ownerId");

-- CreateIndex
CREATE INDEX "Server_nodeId_idx" ON "Server"("nodeId");

-- CreateIndex
CREATE INDEX "Server_eggId_idx" ON "Server"("eggId");

-- CreateIndex
CREATE INDEX "Server_suspended_idx" ON "Server"("suspended");

-- CreateIndex
CREATE INDEX "ServerVariable_serverId_idx" ON "ServerVariable"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerVariable_serverId_eggVariableId_key" ON "ServerVariable"("serverId", "eggVariableId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupSchedule" ADD CONSTRAINT "BackupSchedule_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "BackupTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backup" ADD CONSTRAINT "Backup_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BackupSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backup" ADD CONSTRAINT "Backup_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "BackupTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringAlert" ADD CONSTRAINT "MonitoringAlert_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "MonitoringCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Egg" ADD CONSTRAINT "Egg_nestId_fkey" FOREIGN KEY ("nestId") REFERENCES "Nest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EggVariable" ADD CONSTRAINT "EggVariable_eggId_fkey" FOREIGN KEY ("eggId") REFERENCES "Egg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_eggId_fkey" FOREIGN KEY ("eggId") REFERENCES "Egg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_defaultAllocationId_fkey" FOREIGN KEY ("defaultAllocationId") REFERENCES "Allocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerVariable" ADD CONSTRAINT "ServerVariable_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerVariable" ADD CONSTRAINT "ServerVariable_eggVariableId_fkey" FOREIGN KEY ("eggVariableId") REFERENCES "EggVariable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

