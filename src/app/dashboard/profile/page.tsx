import { PageHeader } from "@/components/shared/status-badge";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Profile" };

export default function DashboardProfilePage() {
  return (
    <div>
      <PageHeader
        title="Profile"
        description="Manage your account details and referral code."
      />
      <ProfileForm />
    </div>
  );
}
