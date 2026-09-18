import { ReviewsView } from "./reviews-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Reviews" };

export default function DashboardReviewsPage() {
  return <ReviewsView />;
}
