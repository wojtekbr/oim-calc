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
    },
    "elektor_przyslal_swoich_poslow": {
        title: "Elektor przysłał swoich posłów",
        getDescription: () => "Gracz, który posiada tą zasadę, na początku bitwy otrzymuje 1VP za scenariusz. Jeżeli przynajmniej połowa pułków w dywizji zostanie złamana, gracz traci ten 1VP."
    },
    "wiarolomny_sojusznik": {
        title: "Wiarołomny sojusznik",
        getDescription: () => "Za każdy regiment pruski (rajtarów, piechoty, dragonów) który zostanie złamany, każdy dostaje dodatkowo -1 motywacji."
    },
    "light_medium_artillery_upgrade": {
        title: "Ulepszenie dział",
        getDescription: () => "Działa lekkie otrzymują darmowe ulepszenie \"Działa 4f\". Działa średnie otrzymują darmowe ulepszenie \"Działa 8f\"."
    },
    "limit_regiments_containing_unit": {
        title: "Ograniczenie składu regimentów",
        getDescription: (params, context) => {
            const { unitsMap, getRegimentDefinition } = context;
            const max = params.max_regiments || 1;

            const unitNames = (params.unit_ids || []).map(uid =>
                unitsMap?.[uid]?.name || uid
            ).join(", ");

            let regimentScope = "regiment";
            if (params.target_regiment_ids && params.target_regiment_ids.length > 0) {
                const regNames = params.target_regiment_ids.map(rid => {
                    const def = getRegimentDefinition ? getRegimentDefinition(rid) : null;
                    return def ? `"${def.name}"` : rid;
                }).join(" lub ");
                regimentScope = `regiment typu ${regNames}`;
            }

            return `Tylko ${max} ${regimentScope} może mieć w składzie: ${unitNames}.`;
        }
    },
    "na_wlasnej_ziemi_3": {
        title: "Na własnej ziemi (3)",
        getDescription: () => "Zasada opisana w podręczniku OiM."
    },
    "na_wlasnej_ziemi_4": {
        title: "Na własnej ziemi (4)",
        getDescription: () => "Zasada opisana w podręczniku OiM."
    },
    "obronic_prusy_za_wszelka_cene": {
        title: "Obronić Prusy za wszelką cenę",
        getDescription: () => "Zasada opisana w podręczniku OiM."
    },
    "to_nie_nasza_wojna": {
        title: "To nie nasza wojna",
        getDescription: () => "Po rozstawieniu wszystkich Jednostek przez obu graczy, należy wykonać test wyszkolenia głównodowodzącego pułku. Test wykonuje się 3 kostkami, jeżeli głównodowodzący ma ####, lub 4 kostkami, jeżeli ma ###, Każda porażka oznacza, że gracz musi położyć na dowolnej jednostce w pułku jeden punkt strat (czaszka)."
    },
    "donnerweter": {
        title: "Donnerweter, co to za kraj!",
        getDescription: () => "Zwiad armii jest domyślnie pomniejszony o 2."
    },
    "nie_przystepuj_do_rozprawy": {
        title: "Nie przystępuj zatem bez wielkiej ostrożności do walnej rozprawy",
        getDescription: () => "Jeżeli Gracz Cesarski jest niebieski może wybierać tylko z scenariuszy Pieszych i Mieszanych, nawet jeżeli jego armia jest konna."
    },
    "grant_one_free_improvements_to_regiments": {
        title: "Darmowe ulepszenie (1 na regiment)",
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

            return `W każdym z pułków: ${regNames}, można za darmo przydzielić jedno ulepszenie: ${impNames}.`;
        }
    },
};