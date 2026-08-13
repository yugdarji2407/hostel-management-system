-- OTP authentication and verification support

CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'REGISTRATION', 'PASSWORD_RESET', 'VERIFICATION');

CREATE TYPE "OtpDeliveryMethod" AS ENUM ('EMAIL', 'SMS');

CREATE TYPE "OtpStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'INVALIDATED', 'BLOCKED', 'DELIVERY_FAILED');

CREATE TABLE "OtpVerification" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "userId" TEXT NOT NULL,
  "studentId" TEXT,
  "purpose" "OtpPurpose" NOT NULL,
  "deliveryMethod" "OtpDeliveryMethod" NOT NULL,
  "recipient" TEXT NOT NULL,
  "otpHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "invalidatedAt" TIMESTAMP(3),
  "attempts" INTEGER DEFAULT 0 NOT NULL,
  "maxAttempts" INTEGER DEFAULT 5 NOT NULL,
  "resendAvailableAt" TIMESTAMP(3) NOT NULL,
  "lastSentAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "status" "OtpStatus" DEFAULT 'ACTIVE' NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "failureReason" TEXT,
  CONSTRAINT "OtpVerification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OtpVerification_publicId_key" UNIQUE ("publicId")
);

ALTER TABLE "OtpVerification" ADD CONSTRAINT "OtpVerification_user_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OtpVerification" ADD CONSTRAINT "OtpVerification_student_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "OtpVerification_userId_purpose_deliveryMethod_status_expiresAt_idx" ON "OtpVerification" ("userId", "purpose", "deliveryMethod", "status", "expiresAt");

CREATE INDEX "OtpVerification_recipient_purpose_deliveryMethod_status_createdAt_idx" ON "OtpVerification" ("recipient", "purpose", "deliveryMethod", "status", "createdAt");

CREATE INDEX "OtpVerification_expiresAt_status_idx" ON "OtpVerification" ("expiresAt", "status");
