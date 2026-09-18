/**
 * Central zod validation schemas (shared by API routes).
 * NOTE: zod v4.
 */
import { z } from "zod";

const cuidLike = z.string().min(1).max(64);

// ---------------- auth ----------------

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(40),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72)
    .regex(/[a-zA-Z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
  referralCode: z.string().trim().max(24).optional().or(z.literal("")),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required").max(72),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(128),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72)
    .regex(/[a-zA-Z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(72),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72)
    .regex(/[a-zA-Z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(40),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+\-\s]*$/, "Phone can only contain digits, + and -")
    .optional()
    .or(z.literal("")),
});

// ---------------- top-up orders ----------------

export const createOrderSchema = z.object({
  packageId: cuidLike,
  ffUid: z
    .string()
    .trim()
    .regex(/^[0-9]{6,12}$/, "Free Fire UID must be 6–12 digits"),
  ffServer: z.string().trim().max(30).optional().or(z.literal("")),
  couponCode: z.string().trim().max(24).optional().or(z.literal("")),
  userNote: z.string().trim().max(300).optional().or(z.literal("")),
});

export const submitOrderPaymentSchema = z.object({
  trxId: z
    .string()
    .trim()
    .min(4, "Transaction ID must be at least 4 characters")
    .max(48, "Transaction ID is too long"),
  screenshotUploadId: cuidLike.optional().or(z.literal("")),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

// ---------------- uploads ----------------

export const uploadKindSchema = z.enum(["PAYMENT_PROOF", "LISTING_SCREENSHOT", "ID_VERIFICATION", "OTHER"]);

// ---------------- tournaments ----------------

export const tournamentCreateSchema = z.object({
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().min(10).max(2000),
  rules: z.string().trim().min(10).max(5000),
  mode: z.enum(["SOLO", "DUO", "SQUAD"]).default("SQUAD"),
  map: z.enum(["BERMUDA", "PURGATORY", "KALAHARI", "ALPINE", "NEXTERRA"]).default("BERMUDA"),
  entryFee: z.number().int().min(0).max(100000).default(0),
  prizePool: z.string().trim().max(500).optional().or(z.literal("")),
  perKillReward: z.number().int().min(0).max(10000).default(0),
  slots: z.number().int().min(2).max(100),
  startsAt: z.string().datetime({ offset: true }).or(z.string().min(10)),
  endsAt: z.string().datetime({ offset: true }).or(z.string().min(10)).optional().or(z.literal("")),
});

export const tournamentUpdateSchema = z
  .object({
    title: z.string().trim().min(4).max(120).optional(),
    description: z.string().trim().min(10).max(2000).optional(),
    rules: z.string().trim().min(10).max(5000).optional(),
    mode: z.enum(["SOLO", "DUO", "SQUAD"]).optional(),
    map: z.enum(["BERMUDA", "PURGATORY", "KALAHARI", "ALPINE", "NEXTERRA"]).optional(),
    entryFee: z.number().int().min(0).max(100000).optional(),
    prizePool: z.string().trim().max(500).nullable().optional().or(z.literal("")),
    perKillReward: z.number().int().min(0).max(10000).optional(),
    slots: z.number().int().min(2).max(100).optional(),
    startsAt: z.string().datetime({ offset: true }).or(z.string().min(10)).optional(),
    endsAt: z.string().datetime({ offset: true }).or(z.string().min(10)).nullable().optional().or(z.literal("")),
    status: z
      .enum(["DRAFT", "UPCOMING", "OPEN", "FULL", "LIVE", "COMPLETED", "CANCELLED"])
      .optional(),
    roomCode: z.string().trim().max(32).nullable().optional().or(z.literal("")),
    roomPassword: z.string().trim().max(32).nullable().optional().or(z.literal("")),
    roomReleased: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: "No changes provided." });

export const tournamentRegisterSchema = z.object({
  inGameName: z.string().trim().min(2, "In-game name is required").max(30),
  ffUid: z
    .string()
    .trim()
    .regex(/^[0-9]{6,12}$/, "Free Fire UID must be 6–12 digits"),
});

export const registrationPaymentSchema = z.object({
  trxId: z
    .string()
    .trim()
    .min(4, "Transaction ID must be at least 4 characters")
    .max(48, "Transaction ID is too long"),
  screenshotUploadId: cuidLike.optional().or(z.literal("")),
});

export const registrationAdminSchema = z.object({
  registrationId: cuidLike,
  action: z.enum(["APPROVE", "REJECT", "VERIFY_PAYMENT", "SET_POSITION", "SET_KILLS", "CLAIM_REWARD", "NOTE"]),
  position: z.number().int().min(1).max(100).optional(),
  kills: z.number().int().min(0).max(100).optional(),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export const rewardSchema = z.object({
  tournamentId: cuidLike,
  rewards: z
    .array(
      z.object({
        position: z.number().int().min(1).max(20),
        rewardType: z.enum(["DIAMONDS", "CASH"]),
        diamondAmount: z.number().int().min(0).max(100000).optional(),
        cashAmount: z.number().int().min(0).max(1000000).optional(),
        description: z.string().trim().max(200).optional().or(z.literal("")),
      })
    )
    .min(1)
    .max(20),
});

// ---------------- marketplace ----------------

export const sensitiveDataSchema = z
  .object({
    accountEmail: z.string().trim().max(120).optional().or(z.literal("")),
    accountPassword: z.string().trim().max(120).optional().or(z.literal("")),
    recoveryEmail: z.string().trim().max(120).optional().or(z.literal("")),
    recoveryPassword: z.string().trim().max(120).optional().or(z.literal("")),
    extra: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .partial();

export const createListingSchema = z.object({
  title: z.string().trim().min(6, "Title must be at least 6 characters").max(100),
  ffUid: z
    .string()
    .trim()
    .regex(/^[0-9]{6,12}$/, "Free Fire UID must be 6–12 digits"),
  description: z.string().trim().min(20, "Please describe the account (min 20 characters)").max(3000),
  level: z.number().int().min(1).max(100).optional(),
  price: z.number().int().min(1, "Price must be at least Rs 1").max(1000000),
  verificationNote: z.string().trim().max(500).optional().or(z.literal("")),
  screenshotUploadIds: z.array(cuidLike).max(8).default([]),
  sensitiveData: sensitiveDataSchema.optional(),
});

export const purchaseRequestSchema = z.object({
  buyerNote: z.string().trim().max(300).optional().or(z.literal("")),
});

export const purchasePaymentSchema = z.object({
  trxId: z
    .string()
    .trim()
    .min(4, "Transaction ID must be at least 4 characters")
    .max(48, "Transaction ID is too long"),
  screenshotUploadId: cuidLike.optional().or(z.literal("")),
});

export const purchaseActionSchema = z.object({
  purchaseId: cuidLike,
  action: z.enum([
    "VERIFY_PAYMENT",
    "OWNERSHIP_VERIFIED",
    "START_TRANSFER",
    "TRANSFER_VERIFIED",
    "COMPLETE",
    "REJECT",
    "CANCEL",
    "REFUND",
    "NOTE",
  ]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  payoutNote: z.string().trim().max(300).optional().or(z.literal("")),
});

export const listingAdminSchema = z.object({
  listingId: cuidLike,
  action: z.enum(["UNDER_REVIEW", "APPROVE", "REJECT", "SUSPEND", "MARK_SOLD", "CANCEL", "NOTE", "DELETE"]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

// ---------------- coupons ----------------

export const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,24}$/, "Code must be 3–24 letters/numbers"),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.number().int().min(1).max(100000),
  minOrder: z.number().int().min(0).max(1000000).default(0),
  maxDiscount: z.number().int().min(1).max(1000000).nullable().optional(),
  expiresAt: z.string().optional().or(z.literal("")).nullable(),
  usageLimit: z.number().int().min(1).max(100000).nullable().optional(),
  perUserLimit: z.number().int().min(1).max(100).default(1),
  active: z.boolean().default(true),
});

export const couponUpdateSchema = z
  .object({
    id: cuidLike,
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,24}$/, "Code must be 3–24 letters/numbers")
      .optional(),
    type: z.enum(["PERCENTAGE", "FIXED"]).optional(),
    value: z.number().int().min(1).max(100000).optional(),
    minOrder: z.number().int().min(0).max(1000000).optional(),
    maxDiscount: z.number().int().min(1).max(1000000).nullable().optional(),
    expiresAt: z.string().nullable().optional().or(z.literal("")),
    usageLimit: z.number().int().min(1).max(100000).nullable().optional(),
    perUserLimit: z.number().int().min(1).max(100).optional(),
    active: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 1, { message: "No changes provided." });

// ---------------- wallet / withdrawals ----------------

export const walletAdjustSchema = z.object({
  userId: cuidLike,
  amount: z.number().int().refine((v) => v !== 0, "Amount cannot be zero"),
  description: z.string().trim().min(3).max(200),
});

export const withdrawalRequestSchema = z.object({
  amount: z.number().int().min(1, "Amount must be at least Rs 1").max(1000000),
  accountName: z.string().trim().min(3, "Account title is required").max(60),
  accountNumber: z.string().trim().min(5, "Account number is required").max(24).regex(/^[0-9+\-]+$/, "Enter a valid account number"),
});

export const withdrawalActionSchema = z.object({
  withdrawalId: cuidLike,
  action: z.enum(["APPROVE", "MARK_PAID", "REJECT"]),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

// ---------------- misc ----------------

export const reviewSchema = z.object({
  targetType: z.enum(["TOPUP", "TOURNAMENT", "MARKETPLACE"]),
  targetId: cuidLike,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(5, "Please write a short review").max(600),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  subject: z.string().trim().min(3, "Subject is required").max(120),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000),
});

export const contactActionSchema = z.object({
  messageId: cuidLike,
  action: z.enum(["MARK_READ", "REPLIED", "CLOSED", "NOTE", "DELETE"]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export const faqSchema = z.object({
  question: z.string().trim().min(6).max(200),
  answer: z.string().trim().min(10).max(3000),
  category: z.string().trim().max(30).default("GENERAL"),
  sortOrder: z.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});

export const faqUpdateSchema = z
  .object({
    id: cuidLike,
    question: z.string().trim().min(6).max(200).optional(),
    answer: z.string().trim().min(10).max(3000).optional(),
    category: z.string().trim().max(30).optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    active: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 1, { message: "No changes provided." });

export const broadcastSchema = z.object({
  type: z.enum(["ORDER", "PAYMENT", "TOURNAMENT", "MARKETPLACE", "WALLET", "REFERRAL", "REVIEW", "ADMIN", "SYSTEM"]).default("ADMIN"),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(1000),
  link: z.string().trim().max(200).optional().or(z.literal("")),
});

export const userAdminSchema = z.object({
  userId: cuidLike,
  action: z.enum(["BAN", "UNBAN", "MAKE_ADMIN", "MAKE_USER", "NOTE"]),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export const packageSchema = z.object({
  title: z.string().trim().min(3).max(60),
  diamonds: z.number().int().min(1).max(1000000),
  price: z.number().int().min(1).max(1000000),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  badge: z.string().trim().max(20).optional().or(z.literal("")),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const packageUpdateSchema = z
  .object({
    id: cuidLike,
    title: z.string().trim().min(3).max(60).optional(),
    diamonds: z.number().int().min(1).max(1000000).optional(),
    price: z.number().int().min(1).max(1000000).optional(),
    description: z.string().trim().max(300).nullable().optional().or(z.literal("")),
    badge: z.string().trim().max(20).nullable().optional().or(z.literal("")),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 1, { message: "No changes provided." });

export const settingsUpdateSchema = z.object(
  Object.fromEntries(
    [
      "SITE_NAME", "SITE_TAGLINE", "SITE_DESCRIPTION", "CONTACT_EMAIL", "CONTACT_PHONE",
      "CONTACT_WHATSAPP", "CONTACT_ADDRESS", "PAYMENTS_ENABLED", "PAYMENT_METHOD_NAME",
      "EASYPAISA_ACCOUNT_TITLE", "EASYPAISA_ACCOUNT_NUMBER", "EASYPAISA_INSTRUCTIONS",
      "MIN_PAYMENT_AMOUNT", "MARKETPLACE_ENABLED", "MARKETPLACE_SELLING_ENABLED",
      "TOURNAMENTS_ENABLED", "REGISTRATION_PAYMENT_NOTE", "REFERRAL_REWARD_AMOUNT",
      "REVIEWS_AUTO_APPROVE", "MAINTENANCE_MODE", "MAINTENANCE_MESSAGE",
    ].map((k) => [k, z.string().max(5000).optional()])
  ) as Record<string, z.ZodOptional<z.ZodString>>
);

export const reviewModerationSchema = z.object({
  reviewId: cuidLike,
  action: z.enum(["APPROVE", "REJECT", "DELETE"]),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export const referralActionSchema = z.object({
  referralId: cuidLike,
  action: z.enum(["PAY_REWARD", "CANCEL"]),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});
