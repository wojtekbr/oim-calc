export const DIVISION_RULES_DEFINITIONS = {
    "krolewski_regiment_artylerii": {
        title: "Królewski Regiment Artylerii",
        getDescription: () => "Wszystkie Jednostki Artylerii dywizyjnej otrzymują darmowe ulepszenie Weterani."
    },
    "grant_improvements_to_specific_regiments": {
        title: "Darmowe ulepszenia dla pułków",
        getDescription: (params, context) => {
            const impNames = (params?.improvement_ids || []).map(id =>
                context.improvements ? (context.improvements[id]?.name || id) : id
            ).join(", ");
            return `Wybrane pułki otrzymują darmowe ulepszenia: ${impNames}.`;
        }
    },
    "grant_improvement_to_all": {
        title: "Ulepszenie dla wszystkich",
        getDescription: (params, context) => {
            const { improvements, unitsMap } = context;

            // 1. Pobieramy ID ulepszeń (obsługa pojedynczego i tablicy)
            const ids = params?.improvement_ids || (params?.improvement_id ? [params.improvement_id] : []);

            // 2. Mapujemy na nazwy
            const impNames = ids.map(id =>
                improvements ? (improvements[id]?.name || id) : id
            ).join(", ");

            // 3. Obsługa wykluczeń
            const excludedIds = params?.excluded_unit_ids || [];
            let excludedText = "";

            if (excludedIds.length > 0) {
                const excludedNames = excludedIds.map(id =>
                    unitsMap ? (unitsMap[id]?.name || id) : id
                ).join(", ");
                excludedText = ` (z wyjątkiem: ${excludedNames})`;
            }

            return `Każda jednostka w Dywizji${excludedText} otrzymuje ulepszenie: ${impNames}.`;
        }
    },
    "additional_pu_points_for_units": {
        title: "Dodatkowe PU za jednostki",
        getDescription: (params, context) => {
            const { unitsMap } = context;
            const requiredAmount = params?.required_unit_amount || 2;
            const bonusPoints = params?.bonus_pu || 6;
            const unitIds = params?.unit_ids || [];

            const unitNames = unitIds.map(id => unitsMap[id]?.name || id).join(" lub ");

            return `Jeśli Twoja dywizja zawiera przynajmniej ${requiredAmount} jednostek typu "${unitNames}", otrzymasz dodatkowo ${bonusPoints} Punktów Ulepszeń.`;
        }
    },
    "limit_max_same_regiments": {
        title: "Limit ilościowy pułków",
        getDescription: (params, context) => {
            const { getRegimentDefinition } = context;

            const targetIds = params.regiment_ids || (params.regiment_id ? [params.regiment_id] : []);
            const max = params.max_amount || 1;

            const regNames = targetIds.map(tid => {
                const regDef = getRegimentDefinition ? getRegimentDefinition(tid) : null;
                return regDef ? `"${regDef.name}"` : tid;
            }).join(" lub ");

            return `Możesz posiadać łącznie maksymalnie ${max} pułk(i/ów) z listy: ${regNames}.`;
        }
    },
    "min_regiments_present": {
        title: "Wymagany Skład Dywizji",
        getDescription: (params, context) => {
            const { getRegimentDefinition } = context;
            const requirements = params?.requirements || [];

            if (requirements.length === 0) return "Brak wymagań.";

            const requirementsList = requirements.map(req => {
                const targetIds = Array.isArray(req.regiment_id) ? req.regiment_id : [req.regiment_id];
                const min = req.min_amount || 1;
                const names = targetIds.map(tid => {
                    const regDef = getRegimentDefinition(tid);
                    return regDef ? regDef.name : tid;
                }).join(" LUB ");
                return `• ${min}x ${names}`;
            }).join("\n");

            return `Dywizja musi zawierać przynajmniej następujące pułki:\n${requirementsList}`;
        }
    },
    "limit_max_units": {
        title: "Limity jednostek",
        getDescription: (params, context) => {
            const constraints = params?.constraints || [];
            if (constraints.length === 0) return "";
            const lines = constraints.map(c => {
                const max = c.max_amount;
                let name = c.custom_name;
                if (!name && context.unitsMap && c.unit_ids) {
                    const names = c.unit_ids.slice(0, 3).map(id => context.unitsMap[id]?.name || id);
                    name = names.join(", ") + (c.unit_ids.length > 3 ? "..." : "");
                }
                return `• Max ${max}x ${name || "Jednostki"}`;
            });
            return `Dywizja posiada następujące ograniczenia ilościowe:\n${lines.join("\n")}`;
        }
    },
    "limit_regiments_with_improvement": {
        title: "Limit Ulepszeń",
        getDescription: (params, context) => {
            const { getRegimentDefinition, improvements } = context;
            const targetRegimentIds = params?.regiment_ids || [];
            const improvementId = params?.improvement_id;
            const maxAmount = params?.max_amount || 1;
            const regNames = targetRegimentIds.map(rid => {
                const def = getRegimentDefinition(rid);
                return def ? def.name : rid;
            }).join(", ");
            const impName = improvements ? (improvements[improvementId]?.name || improvementId) : improvementId;
            return `Tylko ${maxAmount} pułk(ów) typu "${regNames}" może zostać ulepszonych o "${impName}".`;
        }
    },
    "banned_units_in_vanguard": {
        title: "Ograniczenia Straży Przedniej",
        getDescription: (params, context) => {
            const { unitsMap } = context;
            const unitIds = params?.banned_unit_ids || params?.unit_ids || [];
            const names = unitIds.map(id => unitsMap[id]?.name || id).join(", ");
            return `Jednostki: "${names}" nie mogą być wystawiane w pułkach Straży Przedniej.`;
        }
    },
    "conditional_unit_restriction": {
        title: "Ograniczenia jednostek",
        getDescription: (params, context) => {
            const { getRegimentDefinition, unitsMap } = context;
            const triggerId = params?.trigger_regiment_id;
            const bannedIds = params?.banned_unit_ids || [];

            const triggerName = getRegimentDefinition(triggerId)?.name || triggerId;
            const unitNames = bannedIds.map(uid => unitsMap[uid]?.name || uid).join(", ");

            return `Jeśli wystawisz "${triggerName}", inne pułki nie mogą zawierać: "${unitNames}".`;
        }
    },
    "extra_regiment_cost": {
        title: "Koszty Specjalne",
        getDescription: (params, context) => {
            const { getRegimentDefinition } = context;
            const names = (params?.regiment_ids || []).map(id => {
                const def = getRegimentDefinition(id);
                return def ? def.name : id;
            }).join(", ");
            const pu = params?.pu_cost;
            return `Pułki: ${names} kosztują dodatkowo ${pu} PU.`;
        }
    },
    "panowie_bracia": {
        title: "Panowie Bracia!",
        getDescription: () => "Za każde dwa pułki Jazdy (Koronnej, Litewskiej, Lekkiej, Hetmańskie, Skrzydłowe, Pospolite Ruszenie), każdy z tych pułków (z wyjątkiem Pospolitego Ruszenia) otrzymuje +1 do Motywacji."
    },
    "klopoty_skarbowe": {
        title: "Kłopoty Skarbowe",
        getDescription: () =>
            "Armia Rzeczpospolitej wiecznie borykała się z pustkami w skarbu, przez co często wojska były opłacane z prywatnych szkatuł magnatów, a nieopłacane wojsko zawiązywało konfederacje.\n\n" +
            "Przed fazą wystawienia wojsk, Rzuć k10:\n" +
            "• 1-2: Wojsko zostało opłacone na czas z królewskiego skarbca: +1 motywacji dla każdego pułku jazdy: koronnej/litewskiej, lekkiej, Lewego/Prawego skrzydła.\n" +
            "• 3-5: Wojsko zostało opłacone z prywatnej kiesy: Brak efektu.\n" +
            "• 6-9: Została obiecana zapłata na następną kwartę: wylosuj po 1 jednostce w każdym pułku jazdy: koronnej/litewskiej, lekkiej, Lewego/Prawego skrzydła. Oddział dostaje 1D.\n" +
            "• 10: Wojsko zawiązało Konfederację: -1 motywacji dla każdego pułku jazdy: koronnej/litewskiej, lekkiej, Lewego/Prawego skrzydła."
    },
    "na_wlasnej_ziemi_3": {
        title: "Na własnej ziemi (3)",
        getDescription: () => "Zasada opisana w podręcznikach OiM."
    },
    "prawowierni_w_okopach": {
        title: "Prawowierni w okopach swoich",
        getDescription: () => "W bitwach w których gracz Turecki jest Niebieskim Graczem, może za darmo wystawić Jeden element Szańców na każdy wystawiony pułk: Sandżak Sipahów lennych z ejaletów europejskich, Sandżak Sipahów Bośniacki/Albański, Sandżak z ejaletów Anatolijskich."
    },
    "wojsko_wybornym_ozywione_duchem": {
        title: "Wojsko wybornym ożywione duchem",
        getDescription: () => "Połóż przy głównodowodzącym armii 1 znacznik neutralny. Dopóki znacznik znajduje się na stole, jednostki Tureckie (ale nie sojusznicze) z rozkazem Szarża, mogą przerzucać 1 kość w niezdanym teście morale. Jeżeli dowolny z pułków Tureckich zostanie złamany, odrzuć znacznik."
    },
    "allah_allah": {
        title: "Allah Allah",
        getDescription: () => "Zasada opisana w podręczniku Armie II. Zasada przypisana do pułku działa w ramach danego pułku. Zasada przypisana do Dywizji odnosi się do Głównodowodzącego Dywizji."
    },
    "zapelnily_sie_nimi_gory": {
        title: "Zapełniły się nimi góry i równiny",
        getDescription: () => "Jeżeli gracz Turecki jest Czerwonym graczem, wszystkie pułki Tureckie (ale nie sojusznicze) mają Motywację podniesioną o 1. Jeżeli jest graczem Niebieskim wszystkie pułki Tureckie (ale nie sojusznicze) mają Motywację obniżoną o 1."
    },
    "free_improvement_for_specific_units": {
        title: "Darmowe Ulepszenia",
        getDescription: (params, context) => {
            const { unitsMap, improvements } = context;
            const unitIds = params?.unit_ids || [];
            const unitNames = unitIds.map(id => unitsMap[id]?.name || id).join(", ");
            const impName = improvements ? (improvements[params?.improvement_id]?.name || params?.improvement_id) : params?.improvement_id;

            return `W każdym pułku, dla ${params?.max_per_regiment || 1} jednostki(ek) z listy: "${unitNames}", ulepszenie "${impName}" jest darmowe.`;
        }
    },
    "czaty": {
        title: "Czaty",
        getDescription: () => "W każdym pułku, jednej jednostce (S Mołojców Strzelców i S Rejestrowych lub M Czerni) można za darmo przydzielić Ulepszenie: Partyzanci."
    },
    "tam_duzo_myltykow": {
        title: "Tam dużo myłtyków",
        getDescription: () => "Zasada opisana w podręczniku OiM2"
    },
    "rozlaly_sie_zagony tatarskie": {
        title: "Rozlały się zagony",
        getDescription: () => "Jeżeli Gracz dowodzący tą armią wygra przeciwstawny test Zwiadu i wybierze efekt Zwiadu: Flankowanie, to może zamienić go na Dalekie obejście.\n" +
            "Zamiast w strefie rozstawienia, można jeden pułk jazdy albo dragonów, albo piechoty z zasadą Podragonieni wystawić w kontakcie z boczną krawędzią pola bitwy, nie bliżej niż 12” od krawędzi należącej do przeciwnika lub dowolnej jego Jednostki."
    },
    "jasyr": {
        title: "Jasyr",
        getDescription: () => "Za każdy Czambuł (Beja, Nuradyna, Mirzy, Nogajów) niebędący pułkiem Straży Przedniej, gracz tatarski musi wystawić grupę Jasyr. Po zakończeniu wstawienia, przeciwnik gracza tatarskiego ustawia Jasyr w zasięgu 4” od dowolnej Jednostki tatarskiej w dowolnej podstrefie rozstawienia lub jeżeli nie ma strefy rozstawienia, w 4\" od dowolnej Jednostki tatarskiej z wyłączeniem jednostek z pułku Straży Przedniej. Każdy pułk tatarski otrzymuje +1 motywacji. Jeżeli na koniec gry przynajmniej połowa grup Jasyru przekroczy próg ucieczki, Przeciwnik otrzymuje 1VP (punkty liczone za scenariusz. Przekroczenie progu ucieczki przez każdą grupę Jasyru powoduje, że każdy pułk Tatarski traci 1 punkt motywacji. "
    },
    "bellum_se_ipsum_alet": {
        title: "Bellum se ipsum alet",
        getDescription: () => "Za każde dwie zniszczone jednostki w pułku, dany pułk traci dodatkowo 1 motywacji."
    },
    "rozbudowany_sztab": {
        title: "Rozbudowany Sztab",
        getDescription: () => "Głównodowodzący Armii może raz na bitwę aktywować dwie jednostki poza dowodzeniem zamiast jednej (za każdą musi zapłacić 1 punkt dowodzenia). Nie mogą to być jednostki z pułku sojuszniczego."
    },
    "dyscyplina": {
        title: "Dyscyplina",
        getDescription: () => "Wszystkie pułki mają motywację zwiększoną o 1."
    },
    "limit_units_by_size_in_regiments": {
        title: "Ograniczenie rozmiaru jednostek",
        getDescription: (params, context) => {
            const { getRegimentDefinition } = context;

            let targetRegimentIds = params?.regiment_ids || [];
            if (!Array.isArray(targetRegimentIds)) targetRegimentIds = [targetRegimentIds];

            const size = (params?.unit_size || "?").toUpperCase();
            const max = params?.max_amount || 0;

            const regNames = targetRegimentIds.map(rid => {
                const def = getRegimentDefinition ? getRegimentDefinition(rid) : null;
                return def ? `"${def.name}"` : rid;
            }).join(", ");

            return `W pułkach: ${regNames} obowiązuje limit maksymalnie ${max} jednostek o rozmiarze ${size}.`;
        }
    },
    "regiment_dependency": {
        title: "Wymagane wsparcie pułkowe",
        getDescription: (params, context) => {
            const { getRegimentDefinition } = context;

            const triggerId = params?.trigger_regiment_id;
            let requiredIds = params?.required_regiment_id || [];
            if (!Array.isArray(requiredIds)) requiredIds = [requiredIds];

            const triggerName = getRegimentDefinition(triggerId)?.name || triggerId;

            const reqNames = requiredIds.map(rid => {
                const def = getRegimentDefinition(rid);
                return def ? `"${def.name}"` : rid;
            }).join(" lub ");

            return `Pułk "${triggerName}" może zostać wystawiony tylko wtedy, gdy w dywizji znajduje się również: ${reqNames}.`;
        }
    },
    "mandatory_support_unit_per_regiment": {
        title: "Obowiązkowe wsparcie",
        getDescription: (params, context) => {
            const { unitsMap, getRegimentDefinition } = context;

            const unitName = unitsMap?.[params.support_unit_id]?.name || params.support_unit_id;
            const amount = params.amount_per_regiment || 1;
            const excludeVanguard = params.exclude_vanguard === true;

            const regNames = (params.regiment_ids || []).map(rid => {
                const def = getRegimentDefinition ? getRegimentDefinition(rid) : null;
                return def ? `"${def.name}"` : rid;
            }).join(", ");

            const vanguardText = excludeVanguard ? " (z wyłączeniem Straży Przedniej)" : "";

            return `Za każdy wystawiony pułk${vanguardText}: ${regNames}, musisz zakupić ${amount}x "${unitName}" z sekcji wsparcia.`;
        }
    },
};