-- Initial schema migration generated from prisma/schema.prisma

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "Role" AS ENUM ('STUDENT', 'RECTOR', 'SECURITY', 'ADMIN');

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'LOCKED', 'DISABLED', 'PENDING');

CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED', 'CANCEL_PENDING', 'CANCELLED', 'GRADUATED', 'INACTIVE');

CREATE TYPE "AllocationStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED');

CREATE TYPE "RoomStatus" AS ENUM ('AVAILABLE', 'PARTIAL', 'FULL', 'MAINTENANCE', 'INACTIVE');

CREATE TYPE "BedStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'INACTIVE');

CREATE TYPE "DeviceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED', 'BLOCKED');

CREATE TYPE "LoginRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

CREATE TYPE "QRPurpose" AS ENUM ('ID_VERIFY', 'ATTENDANCE');

CREATE TYPE "QRStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED');

CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED');

CREATE TYPE "AttendanceSource" AS ENUM ('QR', 'ADMIN', 'RECTOR', 'SECURITY', 'SYSTEM');

CREATE TYPE "BillStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED', 'CLOSED');

CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'WAIVED', 'OVERDUE');

CREATE TYPE "CalculationMethod" AS ENUM ('EQUAL', 'CUSTOM', 'SEAT_WEIGHTED', 'METER_BASED');

CREATE TYPE "ReceiptStatus" AS ENUM ('ISSUED', 'CANCELLED', 'REVERSED');

CREATE TYPE "FeeType" AS ENUM ('RESIDENTIAL', 'MESS', 'OTHER');

CREATE TYPE "VehicleType" AS ENUM ('BIKE', 'MOTORCYCLE', 'SCOOTER', 'CAR', 'OTHER');

CREATE TYPE "VehicleStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'BLOCKED');

CREATE TYPE "CancellationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TYPE "RefundStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'PARTIAL', 'COMPLETED', 'FAILED');

CREATE TYPE "ComplaintCategory" AS ENUM ('ROOM', 'ELECTRICITY', 'MESS', 'WATER', 'CLEANING', 'SECURITY', 'MAINTENANCE', 'OTHER');

CREATE TYPE "ComplaintStatus" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'ASSIGNED', 'RESOLVED', 'REJECTED');

CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

CREATE TYPE "ApplicationType" AS ENUM ('HOSTEL_ADMISSION', 'ROOM_CHANGE', 'LEAVE_OUTPASS', 'VEHICLE_REGISTRATION', 'HOSTEL_CANCELLATION', 'COMPLAINT', 'OTHER');

CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TYPE "PassType" AS ENUM ('OUTPASS', 'LEAVE', 'WEEKEND', 'EMERGENCY');

CREATE TYPE "PassStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

CREATE TYPE "NotificationType" AS ENUM ('SECURITY', 'FEE', 'BILL', 'ATTENDANCE', 'APPLICATION', 'COMPLAINT', 'GENERAL', 'MENU', 'PASS', 'VEHICLE', 'CANCELLATION');

CREATE TYPE "SessionEvent" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGIN_PENDING', 'DEVICE_APPROVED', 'DEVICE_REJECTED', 'LOGOUT', 'LOGOUT_ALL', 'SESSION_EXPIRED', 'SESSION_REVOKED', 'PASSWORD_CHANGED', 'ACCOUNT_LOCKED');


CREATE TABLE "User" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "email" TEXT NOT NULL,
  "normalizedEmail" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "status" "UserStatus" DEFAULT 'ACTIVE' NOT NULL,
  "emailVerifiedAt" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "lastPasswordChangedAt" TIMESTAMP(3),
  "failedLoginAttempts" INTEGER DEFAULT 0 NOT NULL,
  "lockedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "User_publicId_key" UNIQUE ("publicId"),
  CONSTRAINT "User_normalizedEmail_key" UNIQUE ("normalizedEmail")
);

CREATE TABLE "Parent" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "relationship" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Parent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Parent_publicId_key" UNIQUE ("publicId")
);

CREATE TABLE "College" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "country" TEXT,
  "status" TEXT DEFAULT 'ACTIVE' NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "College_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "College_publicId_key" UNIQUE ("publicId")
);

CREATE TABLE "Hostel" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "address" TEXT,
  "contactPhone" TEXT,
  "contactEmail" TEXT,
  "timezone" TEXT DEFAULT 'Asia/Kolkata' NOT NULL,
  "status" TEXT DEFAULT 'ACTIVE' NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Hostel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Hostel_publicId_key" UNIQUE ("publicId")
);

CREATE TABLE "Room" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "hostelId" TEXT NOT NULL,
  "roomNumber" TEXT NOT NULL,
  "floor" TEXT,
  "block" TEXT,
  "capacity" INTEGER NOT NULL,
  "status" "RoomStatus" DEFAULT 'AVAILABLE' NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Room_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Room_publicId_key" UNIQUE ("publicId"),
  CONSTRAINT "Room_hostelId_roomNumber_key" UNIQUE ("hostelId", "roomNumber")
);

CREATE TABLE "Bed" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "roomId" TEXT NOT NULL,
  "bedNumber" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" "BedStatus" DEFAULT 'AVAILABLE' NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Bed_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Bed_publicId_key" UNIQUE ("publicId"),
  CONSTRAINT "Bed_roomId_bedNumber_key" UNIQUE ("roomId", "bedNumber")
);

CREATE TABLE "Student" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "userId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "emailDisplay" TEXT,
  "photoUrl" TEXT,
  "collegeId" TEXT NOT NULL,
  "course" TEXT,
  "semester" INTEGER NOT NULL,
  "parentId" TEXT,
  "hostelId" TEXT,
  "roomId" TEXT,
  "bedId" TEXT,
  "academicYear" TEXT NOT NULL,
  "admissionDate" TIMESTAMP(3),
  "status" "StudentStatus" DEFAULT 'ACTIVE' NOT NULL,
  "idCardPrintAllowed" BOOLEAN DEFAULT false NOT NULL,
  "idCardDownloadAllowed" BOOLEAN DEFAULT false NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Student_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Student_publicId_key" UNIQUE ("publicId"),
  CONSTRAINT "Student_userId_key" UNIQUE ("userId"),
  CONSTRAINT "Student_enrollmentId_key" UNIQUE ("enrollmentId")
);

CREATE TABLE "HostelAllocation" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "studentId" TEXT NOT NULL,
  "hostelId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "bedId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "status" "AllocationStatus" DEFAULT 'ACTIVE' NOT NULL,
  "assignedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HostelAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HostelAllocation_publicId_key" UNIQUE ("publicId")
);

CREATE TABLE "Fee" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "studentId" TEXT NOT NULL,
  "type" "FeeType" NOT NULL,
  "academicYear" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Fee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeeReceipt" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "receiptNumber" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "academicYear" TEXT NOT NULL,
  "receiptDate" TIMESTAMP(3) NOT NULL,
  "totalAmount" DECIMAL(12,2) NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "status" "ReceiptStatus" DEFAULT 'ISSUED' NOT NULL,
  "issuedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeeReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FeeReceipt_publicId_key" UNIQUE ("publicId"),
  CONSTRAINT "FeeReceipt_receiptNumber_key" UNIQUE ("receiptNumber")
);

CREATE TABLE "FeeReceiptLineItem" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "receiptId" TEXT NOT NULL,
  "feeType" "FeeType" NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "FeeReceiptLineItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LightBill" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "hostelId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "billingMonth" INTEGER NOT NULL,
  "billingYear" INTEGER NOT NULL,
  "totalRoomAmount" DECIMAL(12,2) NOT NULL,
  "occupantCountSnapshot" INTEGER NOT NULL,
  "calculationMethod" "CalculationMethod" NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "status" "BillStatus" DEFAULT 'DRAFT' NOT NULL,
  "generatedBy" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LightBill_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LightBill_publicId_key" UNIQUE ("publicId")
);

CREATE TABLE "LightBillShare" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "billId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "bedId" TEXT,
  "allocatedAmount" DECIMAL(12,2) NOT NULL,
  "paymentStatus" "PaymentStatus" DEFAULT 'PENDING' NOT NULL,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LightBillShare_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LightBillShare_publicId_key" UNIQUE ("publicId"),
  CONSTRAINT "LightBillShare_billId_studentId_key" UNIQUE ("billId", "studentId")
);

CREATE TABLE "MessMenuWeek" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "hostelId" TEXT NOT NULL,
  "weekStartDate" TIMESTAMP(3) NOT NULL,
  "weekEndDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT DEFAULT 'DRAFT' NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessMenuWeek_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessMenuDay" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "weekId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "specialNote" TEXT,
  CONSTRAINT "MessMenuDay_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessMenuDay_weekId_date_key" UNIQUE ("weekId", "date")
);

CREATE TABLE "MessMeal" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "dayId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "title" TEXT,
  "notes" TEXT,
  CONSTRAINT "MessMeal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessMealItem" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "mealId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER DEFAULT 0 NOT NULL,
  "isAvailable" BOOLEAN DEFAULT true NOT NULL,
  CONSTRAINT "MessMealItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Attendance" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "studentId" TEXT NOT NULL,
  "attendanceDate" DATE NOT NULL,
  "status" "AttendanceStatus" NOT NULL,
  "markedByUserId" TEXT NOT NULL,
  "markedByRole" "Role" NOT NULL,
  "qrTokenId" TEXT,
  "markedAt" TIMESTAMP(3) NOT NULL,
  "source" "AttendanceSource" NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Attendance_publicId_key" UNIQUE ("publicId"),
  CONSTRAINT "Attendance_qrTokenId_key" UNIQUE ("qrTokenId"),
  CONSTRAINT "Attendance_studentId_attendanceDate_key" UNIQUE ("studentId", "attendanceDate")
);

CREATE TABLE "AttendanceCorrection" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "attendanceId" TEXT NOT NULL,
  "oldStatus" "AttendanceStatus" NOT NULL,
  "newStatus" "AttendanceStatus" NOT NULL,
  "reason" TEXT NOT NULL,
  "changedBy" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "studentId" TEXT NOT NULL,
  CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Vehicle" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "studentId" TEXT NOT NULL,
  "vehicleUniqueId" TEXT NOT NULL,
  "vehicleNumber" TEXT NOT NULL,
  "normalizedVehicleNumber" TEXT NOT NULL,
  "vehicleType" "VehicleType" NOT NULL,
  "ownerNameSnapshot" TEXT NOT NULL,
  "status" "VehicleStatus" DEFAULT 'PENDING' NOT NULL,
  "verified" BOOLEAN DEFAULT false NOT NULL,
  "verifiedBy" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Vehicle_publicId_key" UNIQUE ("publicId"),
  CONSTRAINT "Vehicle_vehicleUniqueId_key" UNIQUE ("vehicleUniqueId")
);

CREATE TABLE "CancellationRequest" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "studentId" TEXT NOT NULL,
  "studentNameSnapshot" TEXT NOT NULL,
  "mobileSnapshot" TEXT NOT NULL,
  "collegeNameSnapshot" TEXT NOT NULL,
  "semester" INTEGER NOT NULL,
  "fatherNameSnapshot" TEXT NOT NULL,
  "requestedDate" TIMESTAMP(3) NOT NULL,
  "address" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "termsAccepted" BOOLEAN NOT NULL,
  "status" "CancellationStatus" DEFAULT 'PENDING' NOT NULL,
  "submittedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "rejectionReason" TEXT,
  "refundStatus" "RefundStatus" DEFAULT 'NOT_APPLICABLE' NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CancellationRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CancellationRequest_publicId_key" UNIQUE ("publicId")
);

CREATE TABLE "Complaint" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "studentId" TEXT NOT NULL,
  "hostelId" TEXT,
  "roomId" TEXT,
  "category" "ComplaintCategory" NOT NULL,
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "ComplaintStatus" DEFAULT 'SUBMITTED' NOT NULL,
  "priority" "Priority" DEFAULT 'MEDIUM' NOT NULL,
  "assignedTo" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Complaint_publicId_key" UNIQUE ("publicId")
);

CREATE TABLE "ComplaintAttachment" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "complaintId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "uploadedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "ComplaintAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ComplaintAttachment_publicId_key" UNIQUE ("publicId")
);

CREATE TABLE "ComplaintStatusHistory" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "complaintId" TEXT NOT NULL,
  "fromStatus" "ComplaintStatus",
  "toStatus" "ComplaintStatus" NOT NULL,
  "actor" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "ComplaintStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Application" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "studentId" TEXT NOT NULL,
  "type" "ApplicationType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "ApplicationStatus" DEFAULT 'DRAFT' NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Application_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Application_publicId_key" UNIQUE ("publicId")
);

CREATE TABLE "ApplicationStatusHistory" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "applicationId" TEXT NOT NULL,
  "fromStatus" "ApplicationStatus",
  "toStatus" "ApplicationStatus" NOT NULL,
  "actor" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "ApplicationStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pass" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "studentId" TEXT NOT NULL,
  "hostelId" TEXT NOT NULL,
  "type" "PassType" NOT NULL,
  "fromDateTime" TIMESTAMP(3) NOT NULL,
  "toDateTime" TIMESTAMP(3) NOT NULL,
  "purpose" TEXT NOT NULL,
  "status" "PassStatus" DEFAULT 'DRAFT' NOT NULL,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedBy" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Pass_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Pass_publicId_key" UNIQUE ("publicId")
);

CREATE TABLE "Device" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "userId" TEXT NOT NULL,
  "serverDeviceId" TEXT NOT NULL,
  "deviceName" TEXT NOT NULL,
  "os" TEXT NOT NULL,
  "browser" TEXT NOT NULL,
  "browserVersion" TEXT,
  "platform" TEXT,
  "ipAddress" TEXT NOT NULL,
  "country" TEXT,
  "city" TEXT,
  "userAgentHash" TEXT NOT NULL,
  "status" "DeviceStatus" DEFAULT 'PENDING' NOT NULL,
  "firstSeenAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "lastSeenAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Device_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Device_publicId_key" UNIQUE ("publicId"),
  CONSTRAINT "Device_serverDeviceId_key" UNIQUE ("serverDeviceId")
);

CREATE TABLE "DeviceStatusHistory" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "deviceId" TEXT NOT NULL,
  "fromStatus" "DeviceStatus",
  "toStatus" "DeviceStatus" NOT NULL,
  "actor" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "DeviceStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoginRequest" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "status" "LoginRequestStatus" DEFAULT 'PENDING' NOT NULL,
  "ipAddress" TEXT NOT NULL,
  "userAgent" TEXT,
  "location" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "rejectionReason" TEXT,
  "sessionIssuedAt" TIMESTAMP(3),
  "pollTokenHash" TEXT,
  CONSTRAINT "LoginRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoginRequest_publicId_key" UNIQUE ("publicId")
);

CREATE TABLE "Session" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "lastSeenAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "ipAddress" TEXT NOT NULL,
  "userAgent" TEXT,
  "remembered" BOOLEAN DEFAULT false NOT NULL,
  "reason" TEXT,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Session_publicId_key" UNIQUE ("publicId"),
  CONSTRAINT "Session_tokenHash_key" UNIQUE ("tokenHash")
);

CREATE TABLE "LoginHistory" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT,
  "event" "SessionEvent" NOT NULL,
  "status" TEXT NOT NULL,
  "ipAddress" TEXT NOT NULL,
  "userAgent" TEXT,
  "location" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "LoginHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoginHistory_publicId_key" UNIQUE ("publicId")
);

CREATE TABLE "QRToken" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "purpose" "QRPurpose" NOT NULL,
  "issuedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "status" "QRStatus" DEFAULT 'ACTIVE' NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "QRToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QRToken_publicId_key" UNIQUE ("publicId"),
  CONSTRAINT "QRToken_tokenHash_key" UNIQUE ("tokenHash")
);

CREATE TABLE "Notification" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "data" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_publicId_key" UNIQUE ("publicId")
);

CREATE TABLE "PasswordResetToken" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasswordResetToken_tokenHash_key" UNIQUE ("tokenHash")
);

CREATE TABLE "UserSettings" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "userId" TEXT NOT NULL,
  "language" TEXT DEFAULT 'en' NOT NULL,
  "timezone" TEXT DEFAULT 'Asia/Kolkata' NOT NULL,
  "emailNotifications" BOOLEAN DEFAULT true NOT NULL,
  "securityNotifications" BOOLEAN DEFAULT true NOT NULL,
  "applicationNotifications" BOOLEAN DEFAULT true NOT NULL,
  "billNotifications" BOOLEAN DEFAULT true NOT NULL,
  "messNotifications" BOOLEAN DEFAULT true NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserSettings_userId_key" UNIQUE ("userId")
);

CREATE TABLE "AuditLog" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "publicId" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "actorUserId" TEXT,
  "actorRole" "Role",
  "action" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "targetUserId" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "requestId" TEXT,
  "success" BOOLEAN DEFAULT true NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_publicId_key" UNIQUE ("publicId")
);

CREATE TABLE "SecurityEvent" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "ip" TEXT,
  "deviceId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffHostelAssignment" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "userId" TEXT NOT NULL,
  "hostelId" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "StaffHostelAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffHostelAssignment_userId_hostelId_role_key" UNIQUE ("userId", "hostelId", "role")
);

CREATE TABLE "IdempotencyKey" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "response" JSONB,
  "status" INTEGER,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "expiresAt" TIMESTAMP(3) DEFAULT now() + interval '24 hours' NOT NULL,
  CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdempotencyKey_expiresAt_key" UNIQUE ("expiresAt"),
  CONSTRAINT "IdempotencyKey_userId_endpoint_key_key" UNIQUE ("userId", "endpoint", "key")
);

CREATE TABLE "OutboxEvent" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "type" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT DEFAULT 'PENDING' NOT NULL,
  "attempts" INTEGER DEFAULT 0 NOT NULL,
  "availableAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SystemSetting" (
  "id" TEXT DEFAULT gen_random_uuid() NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SystemSetting_key_key" UNIQUE ("key")
);

ALTER TABLE "Room" ADD CONSTRAINT "Room_hostel_fkey" FOREIGN KEY ("hostelId") REFERENCES "Hostel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Bed" ADD CONSTRAINT "Bed_room_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Student" ADD CONSTRAINT "Student_user_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Student" ADD CONSTRAINT "Student_parent_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Student" ADD CONSTRAINT "Student_college_fkey" FOREIGN KEY ("collegeId") REFERENCES "College" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Student" ADD CONSTRAINT "Student_hostel_fkey" FOREIGN KEY ("hostelId") REFERENCES "Hostel" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Student" ADD CONSTRAINT "Student_room_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Student" ADD CONSTRAINT "Student_bed_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HostelAllocation" ADD CONSTRAINT "HostelAllocation_student_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HostelAllocation" ADD CONSTRAINT "HostelAllocation_hostel_fkey" FOREIGN KEY ("hostelId") REFERENCES "Hostel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HostelAllocation" ADD CONSTRAINT "HostelAllocation_room_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HostelAllocation" ADD CONSTRAINT "HostelAllocation_bed_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Fee" ADD CONSTRAINT "Fee_student_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FeeReceipt" ADD CONSTRAINT "FeeReceipt_student_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FeeReceiptLineItem" ADD CONSTRAINT "FeeReceiptLineItem_receipt_fkey" FOREIGN KEY ("receiptId") REFERENCES "FeeReceipt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LightBill" ADD CONSTRAINT "LightBill_hostel_fkey" FOREIGN KEY ("hostelId") REFERENCES "Hostel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LightBill" ADD CONSTRAINT "LightBill_room_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LightBillShare" ADD CONSTRAINT "LightBillShare_bill_fkey" FOREIGN KEY ("billId") REFERENCES "LightBill" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LightBillShare" ADD CONSTRAINT "LightBillShare_student_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LightBillShare" ADD CONSTRAINT "LightBillShare_bed_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MessMenuWeek" ADD CONSTRAINT "MessMenuWeek_hostel_fkey" FOREIGN KEY ("hostelId") REFERENCES "Hostel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MessMenuDay" ADD CONSTRAINT "MessMenuDay_week_fkey" FOREIGN KEY ("weekId") REFERENCES "MessMenuWeek" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MessMeal" ADD CONSTRAINT "MessMeal_day_fkey" FOREIGN KEY ("dayId") REFERENCES "MessMenuDay" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MessMealItem" ADD CONSTRAINT "MessMealItem_meal_fkey" FOREIGN KEY ("mealId") REFERENCES "MessMeal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_student_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_qrToken_fkey" FOREIGN KEY ("qrTokenId") REFERENCES "QRToken" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_attendance_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_student_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_student_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_student_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_student_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_complaint_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ComplaintStatusHistory" ADD CONSTRAINT "ComplaintStatusHistory_complaint_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Application" ADD CONSTRAINT "Application_student_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ApplicationStatusHistory" ADD CONSTRAINT "ApplicationStatusHistory_application_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Pass" ADD CONSTRAINT "Pass_student_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Device" ADD CONSTRAINT "Device_user_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeviceStatusHistory" ADD CONSTRAINT "DeviceStatusHistory_device_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LoginRequest" ADD CONSTRAINT "LoginRequest_user_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LoginRequest" ADD CONSTRAINT "LoginRequest_device_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Session" ADD CONSTRAINT "Session_user_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Session" ADD CONSTRAINT "Session_device_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_user_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QRToken" ADD CONSTRAINT "QRToken_student_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_user_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_user_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_user_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_user_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffHostelAssignment" ADD CONSTRAINT "StaffHostelAssignment_user_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StaffHostelAssignment" ADD CONSTRAINT "StaffHostelAssignment_hostel_fkey" FOREIGN KEY ("hostelId") REFERENCES "Hostel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "User_role_status_idx" ON "User" ("role", "status");

CREATE INDEX "User_normalizedEmail_status_idx" ON "User" ("normalizedEmail", "status");

CREATE INDEX "Room_hostelId_status_idx" ON "Room" ("hostelId", "status");

CREATE INDEX "Bed_roomId_status_idx" ON "Bed" ("roomId", "status");

CREATE INDEX "Student_hostelId_roomId_status_idx" ON "Student" ("hostelId", "roomId", "status");

CREATE INDEX "HostelAllocation_studentId_status_idx" ON "HostelAllocation" ("studentId", "status");

CREATE INDEX "HostelAllocation_bedId_status_idx" ON "HostelAllocation" ("bedId", "status");

CREATE INDEX "HostelAllocation_roomId_status_idx" ON "HostelAllocation" ("roomId", "status");

CREATE INDEX "FeeReceipt_studentId_receiptDate_idx" ON "FeeReceipt" ("studentId", "receiptDate");

CREATE INDEX "LightBill_hostelId_roomId_billingYear_billingMonth_idx" ON "LightBill" ("hostelId", "roomId", "billingYear", "billingMonth");

CREATE INDEX "LightBillShare_studentId_paymentStatus_idx" ON "LightBillShare" ("studentId", "paymentStatus");

CREATE INDEX "Attendance_studentId_markedAt_idx" ON "Attendance" ("studentId", "markedAt");

CREATE INDEX "Vehicle_studentId_status_idx" ON "Vehicle" ("studentId", "status");

CREATE INDEX "Vehicle_normalizedVehicleNumber_idx" ON "Vehicle" ("normalizedVehicleNumber");

CREATE INDEX "CancellationRequest_studentId_status_idx" ON "CancellationRequest" ("studentId", "status");

CREATE INDEX "Complaint_studentId_status_idx" ON "Complaint" ("studentId", "status");

CREATE INDEX "Application_studentId_status_idx" ON "Application" ("studentId", "status");

CREATE INDEX "Pass_studentId_status_fromDateTime_idx" ON "Pass" ("studentId", "status", "fromDateTime");

CREATE INDEX "Device_userId_status_idx" ON "Device" ("userId", "status");

CREATE INDEX "Device_serverDeviceId_status_idx" ON "Device" ("serverDeviceId", "status");

CREATE INDEX "LoginRequest_userId_status_expiresAt_idx" ON "LoginRequest" ("userId", "status", "expiresAt");

CREATE INDEX "Session_userId_expiresAt_revokedAt_idx" ON "Session" ("userId", "expiresAt", "revokedAt");

CREATE INDEX "LoginHistory_userId_createdAt_idx" ON "LoginHistory" ("userId", "createdAt");

CREATE INDEX "QRToken_studentId_purpose_status_expiresAt_idx" ON "QRToken" ("studentId", "purpose", "status", "expiresAt");

CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification" ("userId", "readAt", "createdAt");

CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken" ("userId", "expiresAt");

CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog" ("actorUserId", "createdAt");

CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog" ("action", "createdAt");

CREATE INDEX "AuditLog_targetUserId_createdAt_idx" ON "AuditLog" ("targetUserId", "createdAt");

CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent" ("status", "availableAt");

CREATE INDEX "LoginRequest_sessionIssuedAt_idx" ON "LoginRequest" ("sessionIssuedAt");
