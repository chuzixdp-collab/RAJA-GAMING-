/**
 * RAJA GAMING — database seed (idempotent).
 *
 * Seeds:
 *  - Admin user from RAJA_ADMIN_EMAIL / RAJA_ADMIN_PASSWORD (hashed with bcrypt)
 *  - Default Free Fire diamond packages
 *  - Default site/payment settings
 *  - Default FAQs
 *
 * Run: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_SETTINGS: Record<string, string> = {
  SITE_NAME: "RAJA GAMING",
  SITE_TAGLINE: "Gaming • Tournaments • Rewards • Community",
  SITE_DESCRIPTION:
    "Free Fire diamond top-up, daily tournaments and a safe admin-verified ID marketplace — powered by RAJA GAMING.",
  CONTACT_EMAIL: "support@rajagaming.app",
  CONTACT_PHONE: "",
  CONTACT_WHATSAPP: "",
  CONTACT_ADDRESS: "",
  PAYMENTS_ENABLED: "true",
  PAYMENT_METHOD_NAME: "EasyPaisa",
  EASYPAISA_ACCOUNT_TITLE: "",
  EASYPAISA_ACCOUNT_NUMBER: "",
  EASYPAISA_INSTRUCTIONS:
    "1) Open your EasyPaisa app and send the exact order amount to the account shown above.\n2) Use the order number as the reference/note if possible.\n3) Take a screenshot of the successful transaction.\n4) Submit the Transaction ID (TID) and screenshot on the order page.\n5) Your order will be verified by our team and completed shortly.",
  MIN_PAYMENT_AMOUNT: "1",
  MARKETPLACE_ENABLED: "true",
  MARKETPLACE_SELLING_ENABLED: "true",
  TOURNAMENTS_ENABLED: "true",
  REGISTRATION_PAYMENT_NOTE:
    "After registering, submit your EasyPaisa transaction ID and screenshot. Room credentials are shared with approved participants only.",
  REFERRAL_REWARD_AMOUNT: "50",
  REVIEWS_AUTO_APPROVE: "false",
  MAINTENANCE_MODE: "false",
  MAINTENANCE_MESSAGE: "RAJA GAMING is undergoing scheduled maintenance. Please check back soon.",
};

const DIAMOND_PACKAGES = [
  { title: "70 Diamonds", diamonds: 70, price: 105, description: "Starter pack — perfect for small top-ups.", badge: null as string | null, sortOrder: 1 },
  { title: "140 Diamonds", diamonds: 140, price: 200, description: "Great value for weekly players.", badge: null, sortOrder: 2 },
  { title: "355 Diamonds", diamonds: 355, price: 510, description: "Most popular choice among players.", badge: "POPULAR", sortOrder: 3 },
  { title: "713 Diamonds", diamonds: 713, price: 1020, description: "Level up faster with bonus value.", badge: null, sortOrder: 4 },
  { title: "1426 Diamonds", diamonds: 1426, price: 2000, description: "Serious value for ranked pushers.", badge: "BEST VALUE", sortOrder: 5 },
  { title: "3000 Diamonds", diamonds: 3000, price: 5000, description: "Ultimate pack for the true kings.", badge: "KING'S PACK", sortOrder: 6 },
];

const FAQS = [
  { category: "TOPUP", q: "How long does a diamond top-up take?", a: "Most top-ups are completed within 30 minutes after your payment is verified by our team. During peak hours it can take up to a few hours.", sort: 1 },
  { category: "TOPUP", q: "What details do I need for a top-up?", a: "You need your Free Fire UID (found in your in-game profile). Double-check it — diamonds sent to a wrong UID cannot be recovered.", sort: 2 },
  { category: "PAYMENT", q: "How do I pay via EasyPaisa?", a: "Create your order, then send the exact amount to the EasyPaisa account shown on the payment page. Submit the Transaction ID (TID) and a screenshot of the receipt. Your order is marked for review immediately.", sort: 3 },
  { category: "PAYMENT", q: "Why is my order not completed instantly?", a: "Every payment is manually verified by our team to prevent fraud. Orders are only marked COMPLETED after payment verification and delivery.", sort: 4 },
  { category: "ORDERS", q: "What do order statuses mean?", a: "PENDING_PAYMENT: waiting for your payment. PAYMENT_SUBMITTED: you submitted proof, awaiting verification. UNDER_REVIEW/APPROVED/PROCESSING: our team is handling it. COMPLETED: diamonds delivered. REJECTED/CANCELLED: not processed — check the notes or contact support.", sort: 5 },
  { category: "TOURNAMENT", q: "How do I join a tournament?", a: "Open the Tournaments page, pick a tournament, register with your in-game name and UID, then submit the entry fee payment (if required). Once approved, room credentials appear on your registration before the match starts.", sort: 6 },
  { category: "TOURNAMENT", q: "Who can see the room code and password?", a: "Only approved participants can see room credentials, and only after the admin releases them. Credentials are never public.", sort: 7 },
  { category: "MARKETPLACE", q: "How does buying a Free Fire ID work?", a: "All trades are handled by RAJA GAMING staff. You submit a purchase request and pay via EasyPaisa. We verify the seller's ownership, verify your payment, oversee the account transfer, and only then complete the sale and pay the seller.", sort: 8 },
  { category: "MARKETPLACE", q: "How do I sell my Free Fire ID?", a: "Submit a listing with your UID, asking price, description and screenshots. Our team reviews ownership proof before the listing goes public. Never share your password with anyone except through the admin-verified transfer process.", sort: 9 },
  { category: "ACCOUNT", q: "I forgot my password. What now?", a: "Use the Forgot Password page. Our team verifies your identity and a reset link is issued to you via your registered contact channel.", sort: 10 },
  { category: "REFUNDS", q: "What if my order fails or I get scammed?", a: "Failed deliveries are refunded to your RAJA Wallet. Marketplace disputes are investigated by admins; funds are only released to sellers after a verified transfer. Contact support with your order number for any issue.", sort: 11 },
];

async function seedAdmin() {
  const email = (process.env.RAJA_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.RAJA_ADMIN_PASSWORD || "";

  if (!email || !password) {
    console.log("⚠ RAJA_ADMIN_EMAIL / RAJA_ADMIN_PASSWORD not set — skipping admin seed.");
    return;
  }
  if (password.length < 8) {
    console.log("⚠ RAJA_ADMIN_PASSWORD too short (min 8) — skipping admin seed.");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  const passwordHash = await bcrypt.hash(password, 12);

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { passwordHash, role: "ADMIN", banned: false },
    });
    console.log(`✔ Admin refreshed: ${email}`);
  } else {
    await prisma.user.create({
      data: {
        email,
        name: "Raja Admin",
        passwordHash,
        role: "ADMIN",
        referralCode: "RAJA-ADMIN",
        wallet: { create: {} },
      },
    });
    console.log(`✔ Admin created: ${email}`);
  }
}

async function seedPackages() {
  for (const p of DIAMOND_PACKAGES) {
    const found = await prisma.diamondPackage.findFirst({
      where: { diamonds: p.diamonds, price: p.price },
    });
    if (!found) {
      await prisma.diamondPackage.create({ data: p });
    }
  }
  console.log(`✔ Diamond packages ensured (${DIAMOND_PACKAGES.length})`);
}

async function seedSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.siteSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
  console.log(`✔ Site settings ensured (${Object.keys(DEFAULT_SETTINGS).length})`);
}

async function seedFaqs() {
  for (const f of FAQS) {
    const exists = await prisma.faq.findFirst({ where: { question: f.q } });
    if (!exists) {
      await prisma.faq.create({
        data: { question: f.q, answer: f.a, category: f.category, sortOrder: f.sort, active: true },
      });
    }
  }
  console.log(`✔ FAQs ensured (${FAQS.length})`);
}

async function main() {
  console.log("— RAJA GAMING seed start —");
  await seedAdmin();
  await seedPackages();
  await seedSettings();
  await seedFaqs();
  console.log("— RAJA GAMING seed done —");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
