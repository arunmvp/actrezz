CREATE TABLE "DmcaRequest" (
    "id" TEXT NOT NULL,
    "claimantName" TEXT NOT NULL,
    "organization" TEXT,
    "claimantEmail" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "mailingAddress" TEXT NOT NULL,
    "rightsHolder" TEXT NOT NULL,
    "copyrightedWork" TEXT NOT NULL,
    "materialUrls" TEXT NOT NULL,
    "additionalDetails" TEXT,
    "signature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "emailDeliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "emailMessageId" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmcaRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DmcaRequest_status_createdAt_idx" ON "DmcaRequest"("status", "createdAt");
CREATE INDEX "DmcaRequest_ipHash_createdAt_idx" ON "DmcaRequest"("ipHash", "createdAt");

ALTER TABLE "DmcaRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "DmcaRequest" FROM anon, authenticated;
