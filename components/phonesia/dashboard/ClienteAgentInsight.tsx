type InsightPriority = "alta" | "buona" | "media" | "bassa";

type Props = {
  clienteNome: string;
  activeServices: string[];
  pendingServices?: string[];
  operatore: string;
  contactStoreLabel: string;
  marketingConsented: boolean;
  whatsappActive: boolean;
  contrattiCount: number;
  opportunitaInviateCount: number;
  ultimaOpportunita: string;
};

const SERVICE_LABELS: Record<string, string> = {
  MOBILE: "mobile",
  FISSO: "fibra / linea fissa",
  ENERGIA: "luce e gas",
  TV: "TV",
  SMARTPHONE: "smartphone",
  ACCESSORI: "accessori",
  SICUREZZA: "sicurezza",
  FOTOVOLTAICO: "fotovoltaico",
};

function hasService(activeServices: string[], service: string) {
  return activeServices.includes(service);
}

function normalizeDisplay(value: string) {
  return value && value !== "—" ? value : "non rilevato";
}

function buildMissingServices(activeServices: string[]) {
  const commercialOrder = [
    "SMARTPHONE",
    "ENERGIA",
    "FISSO",
    "SICUREZZA",
    "FOTOVOLTAICO",
    "ACCESSORI",
  ];

  return commercialOrder.filter((service) => !hasService(activeServices, service));
}

function getPriority(params: {
  marketingConsented: boolean;
  whatsappActive: boolean;
  missingServices: string[];
  contrattiCount: number;
}): InsightPriority {
  if (!params.marketingConsented || !params.whatsappActive) return "bassa";

  if (params.missingServices.includes("ENERGIA") || params.missingServices.includes("SMARTPHONE")) {
    return "alta";
  }

  if (params.contrattiCount === 0 || params.missingServices.length >= 3) {
    return "buona";
  }

  if (params.missingServices.length > 0) {
    return "media";
  }

  return "bassa";
}

function priorityBadgeClass(priority: InsightPriority) {
  if (priority === "alta") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (priority === "buona") return "border-orange-200 bg-orange-50 text-orange-700";
  if (priority === "media") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function priorityLabel(priority: InsightPriority) {
  if (priority === "alta") return "Alta priorità";
  if (priority === "buona") return "Buona opportunità";
  if (priority === "media") return "Da valutare";
  return "Bassa priorità";
}

function buildMainRecommendation(params: {
  marketingConsented: boolean;
  whatsappActive: boolean;
  missingServices: string[];
  activeServices: string[];
}) {
  if (!params.marketingConsented) {
    return "Non inviare comunicazioni marketing automatiche: manca il consenso marketing. Puoi usare questa scheda solo per assistenza o richiesta esplicita del cliente.";
  }

  if (!params.whatsappActive) {
    return "Prima di proporre offerte via WhatsApp conviene attivare o verificare il canale WhatsApp del cliente.";
  }

  if (params.missingServices.includes("SMARTPHONE")) {
    return "Prima proposta consigliata: verificare tariffa e operatore attuale per valutare uno smartphone abbinato a una soluzione adatta.";
  }

  if (params.missingServices.includes("ENERGIA")) {
    return "Proposta consigliata: chiedere una bolletta recente e verificare se ci sono margini per luce e gas.";
  }

  if (params.missingServices.includes("FISSO")) {
    return "Proposta consigliata: controllare copertura e indirizzo per valutare fibra o linea casa.";
  }

  if (params.activeServices.length === 0) {
    return "La scheda non ha servizi attivi rilevati: prima di proporre offerte, controlla la situazione reale del cliente.";
  }

  return "Cliente già abbastanza coperto: valuta accessori, sicurezza, fotovoltaico o un controllo generale della spesa.";
}

function buildChecklist(params: {
  activeServices: string[];
  missingServices: string[];
  marketingConsented: boolean;
  whatsappActive: boolean;
  operatore: string;
}) {
  const checklist: string[] = [];

  checklist.push(`Operatore principale rilevato: ${normalizeDisplay(params.operatore)}.`);

  if (params.activeServices.length > 0) {
    checklist.push(
      `Servizi attivi: ${params.activeServices
        .map((service) => SERVICE_LABELS[service] ?? service.toLowerCase())
        .join(", ")}.`,
    );
  } else {
    checklist.push("Nessun servizio attivo rilevato: verifica manualmente prima di proporre.");
  }

  if (params.missingServices.length > 0) {
    checklist.push(
      `Servizi non censiti, da verificare: ${params.missingServices
        .slice(0, 4)
        .map((service) => SERVICE_LABELS[service] ?? service.toLowerCase())
        .join(", ")}.`,
    );
  }

  checklist.push(
    params.marketingConsented
      ? "Consenso marketing presente: puoi proporre opportunità nel rispetto della richiesta e del contesto."
      : "Consenso marketing assente: non fare campagne o offerte outbound.",
  );

  checklist.push(
    params.whatsappActive
      ? "WhatsApp attivo: il canale cliente è utilizzabile."
      : "WhatsApp non attivo: prima verifica il canale di contatto.",
  );

  return checklist;
}

function buildSuggestedMessage(params: {
  clienteNome: string;
  missingServices: string[];
  contactStoreLabel: string;
  marketingConsented: boolean;
  whatsappActive: boolean;
}) {
  const firstName = params.clienteNome.split(" ").filter(Boolean)[0] || "Cliente";

  if (!params.marketingConsented || !params.whatsappActive) {
    return "Messaggio non suggerito: prima verifica consenso marketing e canale WhatsApp.";
  }

  if (params.missingServices.includes("SMARTPHONE")) {
    return `Ciao ${firstName} 😊 possiamo controllare insieme la tua tariffa attuale e valutare se c’è una soluzione adatta per abbinare un nuovo smartphone. Passa da ${params.contactStoreLabel} oppure dimmi quando preferisci essere ricontattato.`;
  }

  if (params.missingServices.includes("ENERGIA")) {
    return `Ciao ${firstName} 😊 se vuoi possiamo fare una verifica sulla tua bolletta luce o gas. Porta una bolletta recente da ${params.contactStoreLabel}, così controlliamo i dati reali e valutiamo se c’è una soluzione più conveniente.`;
  }

  if (params.missingServices.includes("FISSO")) {
    return `Ciao ${firstName} 😊 possiamo verificare copertura e disponibilità per internet casa. Passa da ${params.contactStoreLabel} con indirizzo e dati dell’attuale linea, così facciamo un controllo preciso.`;
  }

  return `Ciao ${firstName} 😊 possiamo fare un controllo della tua situazione attuale e capire se ci sono servizi utili da migliorare. Il tuo riferimento è ${params.contactStoreLabel}.`;
}

export default function ClienteAgentInsight({
  clienteNome,
  activeServices,
  pendingServices = [],
  operatore,
  contactStoreLabel,
  marketingConsented,
  whatsappActive,
  contrattiCount,
  opportunitaInviateCount,
  ultimaOpportunita,
}: Props) {
  const missingServices = buildMissingServices([...activeServices, ...pendingServices]);
  const priority = getPriority({
    marketingConsented,
    whatsappActive,
    missingServices,
    contrattiCount,
  });

  const recommendation = buildMainRecommendation({
    marketingConsented,
    whatsappActive,
    missingServices,
    activeServices,
  });

  const checklist = buildChecklist({
    activeServices,
    missingServices,
    marketingConsented,
    whatsappActive,
    operatore,
  });

  if (pendingServices.length) checklist.unshift(`Stato da verificare per: ${pendingServices.map(service => SERVICE_LABELS[service] ?? service).join(", ")}. Chiedere conferma al cliente.`);

  const suggestedMessage = buildSuggestedMessage({
    clienteNome,
    missingServices,
    contactStoreLabel,
    marketingConsented,
    whatsappActive,
  });

  return (
    <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-3 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-orange-700">
            AI Agent interno
          </div>

          <h2 className="text-2xl font-black tracking-tight text-slate-950">
            Suggerimento operativo per il cliente
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
            Analisi automatica per aiutare l’operatore a scegliere la prossima azione,
            senza inventare prezzi o promozioni.
          </p>
        </div>

        <div
          className={[
            "inline-flex w-fit rounded-full border px-4 py-2 text-sm font-black",
            priorityBadgeClass(priority),
          ].join(" ")}
        >
          {priorityLabel(priority)}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
            Prossima azione consigliata
          </h3>
          <p className="mt-3 text-base font-bold leading-relaxed text-slate-950">
            {recommendation}
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Contratti" value={String(contrattiCount)} />
            <MiniMetric label="Opportunità inviate" value={String(opportunitaInviateCount)} />
            <MiniMetric label="Ultima opportunità" value={ultimaOpportunita || "—"} />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
            Cosa controllare prima
          </h3>

          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
            {checklist.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-orange-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-orange-200 bg-orange-50 p-5">
        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-orange-700">
          Messaggio suggerito
        </h3>
        <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-800">
          {suggestedMessage}
        </p>
      </div>
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
      <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-black text-slate-950" title={value}>
        {value}
      </div>
    </div>
  );
}
