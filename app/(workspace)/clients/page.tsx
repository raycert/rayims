import { ClientListView } from "@/components/clients/client-list-view";
import { PageContainer } from "@/components/layout/page-container";
import { listClients } from "@/lib/queries/clients";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const clients = await listClients();

  return (
    <PageContainer>
      <ClientListView clients={clients} />
    </PageContainer>
  );
}
