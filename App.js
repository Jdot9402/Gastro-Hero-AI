// App.js
import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  FlatList,
  Image,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
  Platform
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Polyfills (du hade dessa i canvas-kommentaren – säkrar fetch/UUID på äldre RN-miljöer)
import "react-native-get-random-values";
import "text-encoding";
import fetch from "cross-fetch";

/* =========================
   Tema & lokalisering
========================= */
const theme = {
  inset: 16,
  colors: {
    bg: "#000000",
    surface: "#0D0F12",
    text: "#F8FAFC",
    textMuted: "#9AA5B1",
    border: "#243141",
    accent: "#5AB4B4",
    accentText: "#042E2E",
  },
  radius: { sm: 10, md: 14, lg: 20, pill: 999 },
  space: (n) => 4 * n,
};

const STRINGS = {
  sv: {
    appName: "Gastro Hero-AI",
    loading: "Laddar recept…",
    openRecipe: "Öppna recept",
    upgradeToOpen: "Uppgradera för att öppna",
    ingredients: "Ingredienser",
    instructions: "Gör så här",
    close: "Stäng",
    saveOffline: "Spara offline",
    saved: "Sparat",
  },
  en: {
    appName: "Gastro Hero-AI",
    loading: "Loading recipes…",
    openRecipe: "Open recipe",
    upgradeToOpen: "Upgrade to open",
    ingredients: "Ingredients",
    instructions: "Instructions",
    close: "Close",
    saveOffline: "Save offline",
    saved: "Saved",
  },
  da: {
    appName: "Gastro Hero-AI",
    loading: "Indlæser opskrifter…",
    openRecipe: "Åbn opskrift",
    upgradeToOpen: "Opgrader for at åbne",
    ingredients: "Ingredienser",
    instructions: "Sådan gør du",
    close: "Luk",
    saveOffline: "Gem offline",
    saved: "Gemt",
  },
  no: {
    appName: "Gastro Hero-AI",
    loading: "Laster inn oppskrifter…",
    openRecipe: "Åpne oppskrift",
    upgradeToOpen: "Oppgrader for å åpne",
    ingredients: "Ingredienser",
    instructions: "Slik gjør du",
    close: "Lukk",
    saveOffline: "Lagre offline",
    saved: "Lagret",
  },
};

/* =========================
   API-konfiguration
========================= */
const SPOON_KEY = "274c065ec09f46498c0dce9c5425fef8";

/* =========================
   Hjälpare
========================= */
function tFactory(lang = "sv") {
  return (k) => (STRINGS[lang] || STRINGS.sv)[k] || k;
}

// Mappa TheMealDB-svar -> vårt format
function mapMealDB(meal) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const ing = meal[`strIngredient${i}`];
    const meas = meal[`strMeasure${i}`];
    if (ing && String(ing).trim()) {
      ingredients.push(meas ? `${String(meas).trim()} ${String(ing).trim()}` : String(ing).trim());
    }
  }
  return {
    id: meal.idMeal,
    title: meal.strMeal,
    image: meal.strMealThumb,
    cuisine: meal.strArea || "world",
    minutes: null,
    difficulty: "easy",
    category: meal.strCategory || "dinner",
    ingredients,
    instructions: meal.strInstructions
      ? meal.strInstructions.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      : [],
    summary: "",
  };
}

async function fetchFallbackMeals(count = 10) {
  const calls = Array.from({ length: count }).map(() =>
    fetch("https://www.themealdb.com/api/json/v1/1/random.php")
      .then((r) => r.json())
      .then((j) => j.meals?.[0])
      .catch(() => null)
  );
  const results = (await Promise.all(calls)).filter(Boolean).map(mapMealDB);
  return results;
}

/* =========================
   Receptkort (horisontell)
========================= */
const CARD_HEIGHT = 160; // konsekvent höjd
const IMG_RATIO = 0.42;  // 42% bild, 58% text

const RecipeCard = ({ item, onPress, selected }) => {
  const isSelected = !!selected;
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          backgroundColor: theme.colors.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: isSelected ? theme.colors.accent : theme.colors.border,
          overflow: "hidden",
          height: CARD_HEIGHT,
          margin: theme.space(2),

          // Glow/lyft-känsla
          shadowColor: theme.colors.accent,
          shadowOpacity: isSelected ? 0.35 : 0.2,
          shadowRadius: isSelected ? 16 : 10,
          shadowOffset: { width: 0, height: 8 },
          elevation: isSelected ? 8 : 5,
        }}
      >
        {/* Bild (vänster) */}
        <View style={{ width: `${IMG_RATIO * 100}%` }}>
          <Image
            source={{ uri: item.image || "https://source.unsplash.com/800x500/?food" }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        </View>

        {/* Text (höger) */}
        <View style={{ flex: 1, padding: theme.space(4), justifyContent: "space-between" }}>
          <View>
            <Text
              style={{ color: theme.colors.text, fontWeight: "800", fontSize: 16 }}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={{ color: theme.colors.textMuted, marginTop: 4 }} numberOfLines={1}>
              {(item.minutes ?? "–")} min · {(item.difficulty || "–")} · {(item.cuisine || "world")}
            </Text>
            {!!item.ingredients?.length && (
              <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 6 }} numberOfLines={1}>
                {item.ingredients.slice(0, 3).join(", ")}
                {item.ingredients.length > 3 ? "…" : ""}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                backgroundColor: "#20262E",
                borderRadius: 999,
                paddingVertical: 6,
                paddingHorizontal: 10,
                marginRight: 8,
              }}
            >
              <Text style={{ color: theme.colors.textMuted }}>{item.category || "dinner"}</Text>
            </View>
            <View
              style={{
                backgroundColor: "#20262E",
                borderRadius: 999,
                paddingVertical: 6,
                paddingHorizontal: 10,
                marginRight: 8,
              }}
            >
              <Text style={{ color: theme.colors.textMuted }}>
                {item.tier === "premium" ? "⭐ Premium" : "Gratis"}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
};

/* =========================
   App
========================= */
export default function App() {
  const lang = "sv"; // sätt via profil senare
  const t = tFactory(lang);
  const { width } = useWindowDimensions();
  const columns = width >= 768 ? 2 : 1;

  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState([]); // alla recept
  const [selected, setSelected] = useState(null); // valt recept (för modal)
  const [showModal, setShowModal] = useState(false);
  const [savedIds, setSavedIds] = useState(new Set());

  // Ladda sparade recept-id:n från AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem("saved_recipes");
        if (v) {
          const arr = JSON.parse(v);
          setSavedIds(new Set(arr));
        }
      } catch {}
    })();
  }, []);

  // Hämta recept (Spoonacular -> hydrering -> fallback: TheMealDB)
  useEffect(() => {
    let mounted = true;

    async function fetchSpoonacular() {
      const res = await fetch(
        `https://api.spoonacular.com/recipes/random?number=20&apiKey=${SPOON_KEY}`
      );
      if (!res.ok) throw new Error(`Spoonacular HTTP ${res.status}`);
      const data = await res.json();

      // Bas-mappning
      const mapped = (data?.recipes || []).map((r, i) => ({
        id: r.id || i + 1,
        title: r.title,
        image: r.image,
        cuisine: r.cuisines?.[0] || "world",
        minutes: r.readyInMinutes,
        difficulty: r.analyzedInstructions?.length > 0 ? "medium" : "easy",
        category: r.dishTypes?.[0] || "dinner",
        ingredients: r.extendedIngredients?.map((ing) => ing.original) || [],
        instructions: r.analyzedInstructions?.[0]?.steps?.map((s) => s.step) || [],
        summary: r.summary || "",
      }));

      // Hydrera detaljer om något saknas
      const needInfo = mapped.filter(
        (x) => !x.ingredients?.length || !x.instructions?.length
      );

      if (needInfo.length) {
        const detailed = await Promise.all(
          needInfo.map(async (x) => {
            try {
              const ir = await fetch(
                `https://api.spoonacular.com/recipes/${x.id}/information?includeNutrition=false&apiKey=${SPOON_KEY}`
              );
              if (!ir.ok) return x;
              const info = await ir.json();
              return {
                ...x,
                title: info.title || x.title,
                image: info.image || x.image,
                cuisine: info.cuisines?.[0] || x.cuisine,
                minutes: info.readyInMinutes ?? x.minutes,
                category: info.dishTypes?.[0] || x.category,
                ingredients:
                  info.extendedIngredients?.map((ing) => ing.original) || x.ingredients,
                instructions:
                  info.analyzedInstructions?.[0]?.steps?.map((s) => s.step) ||
                  x.instructions,
                summary: info.summary || x.summary,
              };
            } catch {
              return x;
            }
          })
        );

        const detailedIds = new Set(detailed.map((d) => d.id));
        return mapped.map((m) => (detailedIds.has(m.id) ? detailed.find((d) => d.id === m.id) : m));
      }

      return mapped;
    }

    async function run() {
      setLoading(true);
      try {
        let list = await fetchSpoonacular();
        if (mounted && (!list || list.length === 0)) {
          list = await fetchFallbackMeals(10);
        }
        if (mounted) setRecipes(list);
      } catch (e) {
        // Fallback
        try {
          const fb = await fetchFallbackMeals(10);
          if (mounted) setRecipes(fb);
        } catch {
          if (mounted) setRecipes([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, []);

  // Spara offline – lagra full receptdata
  const saveOffline = async (recipe) => {
    try {
      // spara hela receptet under nyckel
      await AsyncStorage.setItem(`recipe_${recipe.id}`, JSON.stringify(recipe));
      // uppdatera index med sparade id:n
      const next = new Set(savedIds);
      next.add(String(recipe.id));
      setSavedIds(next);
      await AsyncStorage.setItem("saved_recipes", JSON.stringify(Array.from(next)));
    } catch (e) {
      // ignorerar tyst för MVP
    }
  };

  const renderItem = ({ item }) => (
    <RecipeCard
      item={item}
      onPress={() => {
        setSelected(item);
        setShowModal(true);
      }}
      selected={selected?.id === item.id}
    />
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View
        style={{
          flex: 1,
          alignSelf: "center",
          width: "100%",
          maxWidth: 1200,
          paddingTop: theme.inset,
        }}
      >
        {/* Header */}
        <View
          style={{
            paddingHorizontal: theme.inset,
            marginBottom: theme.space(3),
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "800", fontSize: 22 }}>
            {t("appName")}
          </Text>
          {/* Språkval kan läggas här senare */}
        </View>

        {/* Lista */}
        {loading ? (
          <View style={{ paddingTop: theme.space(10), alignItems: "center" }}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
            <Text style={{ color: theme.colors.textMuted, marginTop: theme.space(3) }}>
              {t("loading")}
            </Text>
          </View>
        ) : (
          <FlatList
            data={recipes}
            key={columns}
            numColumns={columns}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            columnWrapperStyle={
              columns > 1 ? { paddingHorizontal: theme.inset, gap: theme.space(2) } : undefined
            }
            contentContainerStyle={
              columns === 1 ? { paddingHorizontal: theme.inset, paddingBottom: theme.space(10) } : { paddingBottom: theme.space(10) }
            }
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Detaljmodal */}
        <Modal
          visible={showModal}
          animationType="slide"
          transparent
          onRequestClose={() => setShowModal(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.6)",
              justifyContent: "flex-end",
            }}
          >
            <View
              style={{
                backgroundColor: theme.colors.surface,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                maxHeight: "85%",
              }}
            >
              <ScrollView contentContainerStyle={{ padding: theme.inset }}>
                <Text style={{ color: theme.colors.text, fontWeight: "800", fontSize: 20 }}>
                  {selected?.title || ""}
                </Text>
                <Text style={{ color: theme.colors.textMuted, marginTop: 4 }}>
                  {selected?.minutes ? `${selected.minutes} min · ` : ""}
                  {selected?.cuisine || "world"}
                </Text>

                {!!selected?.image && (
                  <Image
                    source={{ uri: selected.image }}
                    style={{
                      width: "100%",
                      height: 220,
                      borderRadius: 12,
                      marginTop: 12,
                    }}
                  />
                )}

                {!!selected?.ingredients?.length && (
                  <View style={{ marginTop: theme.space(4) }}>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontWeight: "700",
                        fontSize: 16,
                        marginBottom: 6,
                      }}
                    >
                      {t("ingredients")}
                    </Text>
                    {selected.ingredients.map((ing, idx) => (
                      <Text key={idx} style={{ color: theme.colors.textMuted, marginBottom: 4 }}>
                        • {ing}
                      </Text>
                    ))}
                  </View>
                )}

                {!!selected?.instructions?.length && (
                  <View style={{ marginTop: theme.space(4), marginBottom: theme.space(2) }}>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontWeight: "700",
                        fontSize: 16,
                        marginBottom: 6,
                      }}
                    >
                      {t("instructions")}
                    </Text>
                    {selected.instructions.map((step, idx) => (
                      <Text key={idx} style={{ color: theme.colors.textMuted, marginBottom: 6 }}>
                        {idx + 1}. {step}
                      </Text>
                    ))}
                  </View>
                )}

                <View
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    justifyContent: "center",
                    marginTop: theme.space(3),
                    marginBottom: theme.space(2),
                  }}
                >
                  <Pressable
                    onPress={() => {
                      if (selected) saveOffline(selected);
                    }}
                    style={{
                      backgroundColor: "#1F2A2F",
                      paddingVertical: theme.space(3),
                      paddingHorizontal: theme.space(6),
                      borderRadius: 999,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: "800" }}>
                      {t("saveOffline")}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setShowModal(false)}
                    style={{
                      backgroundColor: theme.colors.accent,
                      paddingVertical: theme.space(3),
                      paddingHorizontal: theme.space(6),
                      borderRadius: 999,
                    }}
                  >
                    <Text style={{ color: theme.colors.accentText, fontWeight: "800" }}>
                      {t("close")}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}
