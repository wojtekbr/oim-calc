export const DIVISION_RULES_DEFINITIONS = {
    "krolewski_regiment_artylerii": {
        title: "Królewski Regiment Artylerii",
        getDescription: () => "Wszystkie Jednostki Artylerii dywizyjnej otrzymują darmowe ulepszenie Weterani."
    },
    "grant_improvements_to_specific_regiments": {
        title: "Darmowe ulepszenia dla pułków",
        getDescription: (params, context) => {
            const { getRegimentDefinition, improvements } = context;

            const regIds = params?.regiment_ids || [];
            const regNames = regIds.map(rid => {
                const def = getRegimentDefinition ? getRegimentDefinition(rid) : null;
                return def ? `"${def.name}"` : rid;
            }).join(", ");

            const impIds = params?.improvement_ids || (params?.improvement_id ? [params.improvement_id] : []) || [];
            const impNames = impIds.map(id =>
                improvements ? (improvements[id]?.name || id) : id
            ).join(", ");

            return `Pułki: ${regNames} otrzymują darmowe ulepszenia: ${impNames}.`;
        }
    },
    "grant_improvement_to_all": {
        title: "Ulepszenie dla wszystkich",
        getDescription: (params, context) => {
            const { improvements, unitsMap } = context;

            // 1. Pobieramy ID ulepszeń (obsługa pojedynczego i tablicy)
            const ids = params?.improvement_ids || (params?.improvement_id ? [params.improvement_id] : []) || [];

            // 2. Mapujemy na nazwy
            const impNames = ids.map(id =>
                improvements ? (improvements[id]?.name || id) : id
            ).join(", ");

            // 3. Obsługa wykluczeń (excluded_unit_ids)
            let exclusionText = "";
            if (params?.excluded_unit_ids && params.excluded_unit_ids.length > 0) {
                const excludedNames = params.excluded_unit_ids.map(uid =>
                    unitsMap?.[uid]?.name || uid
                ).join(", ");
                exclusionText = ` (z wyłączeniem: ${excludedNames})`;
            }

            return `Wszystkie jednostki w dywizji${exclusionText} otrzymują darmowe ulepszenie: ${impNames}.`;
        }
    },
    "mandatory_support_unit_per_regiment": {
        title: "Wymagane wsparcie",
        getDescription: (params, context) => {
            const { unitsMap, getRegimentDefinition } = context;
            const unitName = unitsMap?.[params.support_unit_id]?.name || params.support_unit_id;
            const amount = params.amount_per_regiment || 1;
            const excludeVanguard = params.exclude_vanguard;

            const regNames = (params.regiment_ids || []).map(rid => {
                const def = getRegimentDefinition ? getRegimentDefinition(rid) : null;
                return def ? `"${def.name}"` : rid;
            }).join(", ");

            const vanguardText = excludeVanguard ? " (z wyłączeniem Straży Przedniej)" : "";

            return `Za każdy wystawiony pułk${vanguardText}: ${regNames}, musisz zakupić ${amount}x "${unitName}" z sekcji wsparcia.`;
        }
    },
    "block_units_if_regiments_present": {
        title: "Blokada jednostek",
        getDescription: (params, context) => {
            const { unitsMap, getRegimentDefinition } = context;

            const triggerNames = (params.trigger_regiment_ids || []).map(rid => {
                const def = getRegimentDefinition ? getRegimentDefinition(rid) : null;
                return def ? `"${def.name}"` : rid;
            }).join(" lub ");

            const unitNames = (params.forbidden_unit_ids || []).map(uid =>
                unitsMap?.[uid]?.name || uid
            ).join(", ");

            const targetInfo = params.target_regiment_ids
                ? ` w pułkach: ${params.target_regiment_ids.map(rid => {
                    const def = getRegimentDefinition ? getRegimentDefinition(rid) : null;
                    return def ? `"${def.name}"` : rid;
                }).join(", ")}`
                : "";

            return `Jeśli wystawisz: ${triggerNames}, nie możesz zakupić jednostek: ${unitNames}${targetInfo}.`;
        }
    },
    "zawsze_obsadzac_wzgorza": {
        title: "Zawsze obsadzać wzgórza",
        getDescription: () => "Efekt zwiadu Flankowanie zostaje zamienione na Obsadzanie wzgórz. Efekt działa, jeżeli w 8 calach od dowolnej podstrefy gracza znajduje się przynajmniej jedno wzgórze (wzgórze musi być w całości w 8 calach). Podczas wystawienia armii, jeden z pułków przydzielonych do podstrefy „Rezerwa” gracz może wystawić na wzgórzu. Gracz wystawia dowolną ilość grup oraz Jednostek Jazdy i Dragonów z tego pułku na wzgórzu, ale tak aby grupy i jednostki mieściły się w obrębie wzgórza. Pozostałe jednostki z tego pułku zostają wystawione w podstrefie „Rezerwa”. Jeżeli w obrębie 8 cali znajduje się więcej niż jedno wzgórze, gracz może wystawić grupy oraz Jednostek Jazdy i Dragonów z wybranego pułku też na kolejnych wzgórzach."
    },
    "poruszac_sie_tylko_dobrymi_traktami": {
        title: "Poruszać się tylko dobrymi traktami (4)",
        getDescription: () => "Za każde D lub punkt strat (czaszka) otrzymane jako Efekt Zwiadu (ale nie w związku z Testem Ryzyka), Efekt Losowy lub Przewagę należy rzucić kostką k10. Przy każdym wyniku mniejszym/równym 5 należy odrzucić ten punkt strat/D."
    },
    "ograniczenie_dragonow_najemnych": {
        title: "Regiment dragonów najemnych",
        getDescription: () => "Może wystawić tylko podstawę Pułku."
    },
    "ograniczenie_piechoty_najemnej": {
        title: "Regiment Piechoty Najemnej",
        getDescription: () => "Nie może wystawić innych Jednostek niż Skwadron muszkieterów."
    },
    "wydano_z_krolewskiego_arsenalu": {
        title: "Wydano z Królewskiego Arsenału",
        getDescription: () => "Wszystkie jednostki Piechoty oraz Dragonii otrzymują ulepszenie Dodatkowa Amunicja. Wszystkie jednostki Rajtarów otrzymują ulepszenie Dodatkowy Pistolet."
    },
    "dzialania_partyzanckie": {
        title: "Działania Partyzanckie",
        getDescription: () => "Duńska armia nie wykazywała inicjatywy i manewrowości, jednocześnie świetnie blokowała działania przeciwnika. Dla tej armii efekt Flankowanie zostaje zastąpiony efektem Zablokowane drogi, oraz możliwość wybrania dodatkowego efektu Zatrute studnie:\n\n" +
            "• Zablokowane drogi: Na początku Wystawienia armii, gracz wskazuje jeden pułk przeciwnika (nie może wskazać pułku w straży przedniej). Pułk musi zostać wystawiony w podstrefie Rezerwa i dodatkowo nie może ona maszerować w pierwszej rundzie gry.\n\n" +
            "• Zatrute studnie: Po wystawieniu wszystkich Jednostek (i zaaplikowaniu efektu Pozoranci), gracz przydziela 2D wybranym 2 Jednostkom przeciwnika (nie może to być ta sama jednostka). Dodatkowo przeciwnik musi przydzielić 2D dwóm innym swoim Jednostkom (nie może to być ta sama jednostka). Wszystkie te Jednostki w Fazie Początkowej pierwszej rundy gry muszą otrzymać rozkaz Reorganizacja."
    },
    "rada_wojenna": {
        title: "Rada Wojenna",
        getDescription: () => "Jeżeli armia należy do Niebieskiego gracza i armia Jest Piesza, Motywacja wszystkich pułków wzrasta o 1. Jeżeli armia należy do Czerwonego gracza i armia jest konna, Motywacja wszystkich pułków wzrasta o 1."
    },
    "dunscy_rekruci": {
        title: "Duńscy Rekruci",
        getDescription: () => "Za każde dwa własne pułki które zostały Złamane, pułk z tą zasadą traci dodatkowy 1 punkt motywacji."
    },
    "generalkrigskommisarie": {
        title: "Generalkrigskommisarie",
        getDescription: () => "Gracz duński otrzymuje dodatkowego dowódcę: Komisarza (użyj statystyk Pułkownika z interwencją 6”), którego może przydzielić do dowolnego (nie sojuszniczego) regimentu. Komisarz ma 2 Punkty Rozkazu i 1 ZA. W przypadku śmierci głównodowodzącego pułku przejmuje tę rolę, nie losuj nowego głównodowodzącego pułku."
    },
    "limit_max_l_units_in_mercenaries": {
        title: "Ograniczenie ilości jednostek L",
        getDescription: () => "W regimentach piechoty najemnej możesz wystawić max jedną Jednostkę w rozmiarze L."
    },
    "pomoc_miejscowych": {
        title: "Pomoc miejscowych",
        getDescription: () => "Zasada opisana w podręczniku OiM."
    }
};