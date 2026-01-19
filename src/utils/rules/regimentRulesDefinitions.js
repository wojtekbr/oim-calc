export const REGIMENT_RULES_DEFINITIONS = {
    "allah_allah": {
        title: "Allah! Allah!",
        description: "Zasada działania opisana w podręcznikach do gry Ogniem i Mieczem."
    },
    "z_calego_imperium": {
        title: "Z całego Imperium zebrani (1)",
        description: "Zasada działania opisana w podręcznikach do gry Ogniem i Mieczem."
    },
    "sipahi_better_equipment": {
        title: "Ulepszenia sipahów",
        description: "Sipahowie mają ulepszenie Lepsze uzbrojenie ochronne i Weterani"
    },
    "aga_is_dizbar": {
        title: "Aga ma statystyki Dizbara",
        description: "Dowódca tego pułku korzysta ze statystyk i zasad specjalnych Dizbara zamiast standardowego Agi."
    },
    "kethuda_is_aga": {
        title: "Kethuda ma statystyki Agi",
        description: "Kethuda w tym pułku posiada statystyki Agi (G1)."
    },
    "posluch_kor": {
        title: "Posłuch",
        description: "Każdy Pułkownik z Partii Wolontarskiej, raz podczas wydawania rozkazu jednostce Wolontarzy może pominąć zasadę Niesubordynacja. Gracz musi poinformować przeciwnika w momencie korzystania z tej zasady."
    },
    "pospolitacy": {
        title: "Pospolitacy",
        description: "Zasada specjalna opisana w podręczniku (1)."
    },
    "lanowa_makes_mixed": {
        title: "Piechota Łanowa",
        description: "Jeżeli wystawisz Piechotę łanową, pułk staje się Mieszany."
    },
    "artillery_req_lanowa_m": {
        title: "Wymagania Artylerii",
        description: "Żeby wystawić Lekkie działa należy wystawić przynajmniej jedną jednostkę Piechoty Łanowej w rozmiarze M."
    },
    "hus_no_lanowa": {
        title: "Ograniczenie Husarskie",
        description: "Żeby wystawić Pospolite Ruszenie po Husarsku nie można wystawić Piechoty Łanowej."
    },
    "hus_m_req_pospolite_l_x2": {
        title: "Wymagania Husarskie M",
        description: "Żeby wystawić Pospolite Ruszenie po Husarsku w rozmiarze M należy wystawić przynajmniej 2 jednostki Pospolitego Ruszenia w rozmiarze L (M)."
    },
    "roznorodne_wyposazenie": {
        title: "Różnorodne wyposażenie",
        description: "Zasada specjalna opisana w podręczniku (1)."
    },
    "posluch_cos": {
        title: "Posłuch",
        description: "Raz podczas wydawania rozkazu jednostce można pominąć zasadę Niesubordynacja. Gracz musi poinformować przeciwnika w momencie korzystania z tej zasady."
    },
    "chlopscy_szpiedzy": {
        title: "Chłopscy szpiedzy",
        description: "Wystawiając Pułk Czerni, Dywizja dostaje dodatkowo tyle wartości wywiadu, ile Jednostek Czerni zostało wystawionych i +1 Czujności"
    },
    "cossack_registered_rules": {
        title: "Pułki rejestrowe",
        description: "Przed rozpoczęciem powstania Chmielnickiego kozacy na służbie Rzeczypospolitej byli podzieleni na Pułki z czego każdy z nich miał swój indywidualny charakter, a wielu z nich było dowodzonych przez znanych Pułkowników.\nW momencie tworzenia pułku wybierz z jakiego regionu pochodzi (W całej armii możesz mieć tylko jeden pułk z danego regionu)."
    },
    "free_unit_improvement": {
        title: "Darmowe Ulepszenie",
        getDescription: (params) => {
            const impNames = (params?.improvement_ids || [params?.improvement_id]).join(" lub ");
            const amount = params?.free_improvements_amount || params?.max_per_regiment || 1;
            const amountText = amount > 1 ? `${amount} wybranych jednostek może` : "Wybrana jednostka może";
            return `${amountText} otrzymać darmowe ulepszenie: ${impNames}. Nie wlicza się ono do limitu ulepszeń.`;
        }
    },
    "unit_dependency": {
        title: "Wymagania jednostek",
        getDescription: (params, context) => {
            const { unitsMap } = context || {};

            const dependentIds = Array.isArray(params.dependent_unit_id)
                ? params.dependent_unit_id
                : [params.dependent_unit_id];

            const requiredIds = Array.isArray(params.required_unit_id)
                ? params.required_unit_id
                : [params.required_unit_id];

            const depNames = dependentIds.map(id => unitsMap?.[id]?.name || id).join(", ");
            const reqNames = requiredIds.map(id => unitsMap?.[id]?.name || id).join(" lub ");

            return `Jednostki: "${depNames}" mogą zostać wystawione tylko wtedy, gdy w pułku znajduje się również: "${reqNames}".`;
        }
    },
    "max_one_l_unit": {
        title: "Ograniczenie ciężkich jednostek",
        description: "W składzie tego regimentu może znajdować się maksymalnie jedna jednostka o rozmiarze L."
    },
    "mos_prikaz_wybornych": {
        title: "Prikaz Strzelców Wybornych",
        description: "Wszystkie jednostki strzelców otrzymują +1 morale i zasadę Strzelanie szeregami."
    },
    "dobrze_sie_bronili": {
        title: "Dobrze się bronili z szkodą większa naszych",
        description: "Pułk nie traci motywacji w przypadku złamania dowolnego innego pułku."
    },
    "jazda_bojarska_1": {
        title: "Jazda Bojarska (1)",
        description: "Po wystawieniu wszystkich jednostek w Pułku, należy wylosować:\n\n" +
            "Dla wszystkich Jednostek Dzieci bojarskich lub Dzieci bojarskich z rohatynami w Pułku:\n" +
            "• Umrzem, rozweselim Cara!\n" +
            "• Świetni wojownicy\n" +
            "• Dobre konie\n" +
            "• Nieustraszeni\n\n" +
            "Dla wszystkich Jednostek Dworian lub Dworian z rohatynami w Pułku:\n" +
            "• Lepszy ekwipunek ochronny\n" +
            "• Świetni wojownicy\n" +
            "• Dodatkowy pistolet\n" +
            "• Nieustraszeni"
    },
    "panowie_bracia": {
        title: "Panowie Bracia",
        description: "Za każde dwa Pułki z tą zasadą, każdy z tych Pułków otrzymuje dodatkowy 1 punkt " +
            "motywacji (wystawiając 4 takie Pułki motywacja wzrośnie o 2). " +
            "Tracąc jeden z tych Pułków, motywacja każdego z nich spada o 2 a nie o 1."
    },
    "restricted_unit_size": {
        title: "Ograniczenie rozwinięcia",
        getDescription: (params, context) => {
            const { unitsMap } = context || {};
            const size = (params?.target_size || "?").toUpperCase();

            const conditions = [];

            if (params?.requires_level_1) {
                conditions.push("Regiment ma wykupiony Poziom I");
            }

            if (params?.forbidden_unit_ids && params.forbidden_unit_ids.length > 0) {
                const names = params.forbidden_unit_ids.map(id => unitsMap?.[id]?.name || id).join(" lub ");
                conditions.push(`nie wybrano: "${names}"`);
            }

            const conditionText = conditions.join(" ORAZ ");

            return `Jednostki mogą zostać rozwinięte do rozmiaru ${size} tylko jeżeli: ${conditionText}.`;
        }
    },
    "unit_blocks_improvements": {
        title: "Wykluczenie ulepszeń",
        getDescription: (params, context) => {
            const { unitsMap, improvements } = context || {};

            const unitNames = (params.trigger_unit_ids || []).map(id =>
                unitsMap?.[id]?.name || id
            ).join(" lub ");

            const impNames = (params.forbidden_improvement_ids || []).map(id =>
                improvements ? (improvements[id]?.name || id) : id
            ).join(", ");

            return `Jeżeli wystawisz w pułku: "${unitNames}", nie możesz wykupić ulepszeń: "${impNames}".`;
        }
    },
};