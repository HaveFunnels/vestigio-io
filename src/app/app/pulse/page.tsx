import { redirect } from "next/navigation";

// Wave 22.8 IA reform — Pulse killed as standalone surface. Its
// check-in role (telemetry de "o que mudou desde minha última visita")
// será reintroduzido como badge no item Plano da sidenav num workitem
// futuro. Hoje qualquer entrada em /app/pulse (incluindo back-button
// e bookmarks antigos) é redirecionada para o Plano corrente via /app,
// que resolve env + mês server-side.
//
// O dashboard bento + widgets antigos vivem no git history. Se algum
// painel daqueles for ressuscitado, encaixe-o como seção/drawer
// dentro do Plano, não como tela paralela.
export default function PulseLegacyRedirectPage() {
	redirect("/app");
}
