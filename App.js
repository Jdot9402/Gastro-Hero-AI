import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  useWindowDimensions,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- Theme ---
const theme = {
  colors: {
    background: '#000000',
    surface: '#111111',
    text: '#ffffff',
    textMuted: '#aaaaaa',
    accent: '#e63946',
    accentText: '#ffffff',
    border: '#242424',
  },
  inset: { padding: 20 },
  space: (v) => v * 8,
  radius: { md: 12 }
};

const STRINGS = {
  sv: { appName: 'Gastro Hero-AI', loading: 'Laddar recept…', saveOffline: 'Spara offline', close: 'Stäng', ingredients: 'Ingredienser', steps: 'Gör så här' },
  en: { appName: 'Gastro Hero-AI', loading: 'Loading recipes…', saveOffline: 'Save offline', close: 'Close', ingredients: 'Ingredients', steps: 'Instructions' }
};

// Spoonacular API key (test)
const SPOON_KEY = '274c065ec09f46498c0dce9c5425fef8';

// --- Card-komponent (vågrätt, bild vänster) ---
const RecipeCard = ({ item, onPress }) => (
  <Pressable onPress={onPress} style={{ flex: 1 }}>
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        margin: theme.space(2),
        padding: theme.space(3),
        alignItems: 'center',
        shadowColor: theme.colors.accent,
        shadowOpacity: 0.2,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4
      }}
    >
      <Image
        source={{ uri: item.image }}
        style={{ width: '40%', height: 120, borderRadius: 12, marginRight: theme.space(3) }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 18 }} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 14, marginTop: 4 }} numberOfLines={1}>
          {(item.minutes ?? item.readyInMinutes ?? '–')} min · {(item.cuisine || item.cuisines?.[0]) || 'world'}
        </Text>
        {!!item.ingredients?.length && (
          <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 6 }} numberOfLines={1}>
            {item.ingredients.slice(0, 3).join(', ')}
            {item.ingredients.length > 3 ? '…' : ''}
          </Text>
        )}
      </View>
    </View>
  </Pressable>
);

export default function App() {
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [savedIds, setSavedIds] = useState(new Set());
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  const columns = width > 700 ? 2 : 1;

  useEffect(() => {
    // Ladda sparade recept-id:n
    AsyncStorage.getItem('saved_recipes')
      .then((v) => {
        if (v) {
          try {
            const arr = JSON.parse(v);
            setSavedIds(new Set(arr));
          } catch {}
        }
      })
      .catch(() => {});

    let mounted = true;

    function mapMealDB(meal) {
      const ingredients = [];
      for (let i = 1; i <= 20; i++) {
        const ing = meal[`strIngredient${i}`];
        const meas = meal[`strMeasure${i}`];
        if (ing && ing.trim())
          ingredients.push(meas ? `${meas.trim()} ${ing.trim()}` : ing.trim());
      }
      return {
        id: meal.idMeal,
        title: meal.strMeal,
        image: meal.strMealThumb,
        cuisine: meal.strArea || 'world',
        minutes: null,
        difficulty: 'easy',
        category: meal.strCategory || 'dinner',
        ingredients,
        instructions: meal.strInstructions
          ? meal.strInstructions.split(/\r?\n/).filter(Boolean)
          : [],
      };
    }

    async function fetchFallbackMeals() {
      // 10 slumpade recept från TheMealDB
      const calls = Array.from({ length: 10 }).map(() =>
        fetch('https://www.themealdb.com/api/json/v1/1/random.php')
          .then((r) => r.json())
          .then((j) => j.meals?.[0])
          .catch(() => null)
      );
      const results = (await Promise.all(calls)).filter(Boolean).map(mapMealDB);
      return results;
    }

    async function fetchRecipes() {
      try {
        setLoading(true);
        // 1) Hämta random recept från Spoonacular
        const res = await fetch(
          `https://api.spoonacular.com/recipes/random?number=20&apiKey=${SPOON_KEY}`
        );
        if (!res.ok) throw new Error(`Spoonacular HTTP ${res.status}`);
        const data = await res.json();

        // 2) Mappa basdata
        const mapped = (data?.recipes || []).map((r, i) => ({
          id: r.id || i + 1,
          title: r.title,
          image: r.image,
          cuisine: r.cuisines?.[0] || 'world',
          minutes: r.readyInMinutes,
          difficulty: r.analyzedInstructions?.length > 0 ? 'medium' : 'easy',
          category: r.dishTypes?.[0] || 'dinner',
          ingredients: r.extendedIngredients?.map((ing) => ing.original) || [],
          instructions: r.analyzedInstructions?.[0]?.steps?.map((s) => s.step) || [],
          summary: r.summary || '',
        }));

        // 3) Hydrera saknade fält via /information
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
                    info.extendedIngredients?.map((ing) => ing.original) ||
                    x.ingredients,
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
          const merged = mapped.map((m) =>
            detailedIds.has(m.id) ? detailed.find((d) => d.id === m.id) : m
          );
          if (mounted) {
            setAll(merged);
            setLoading(false);
            return;
          }
        }

        if (mounted) setAll(mapped);
      } catch (e) {
        console.warn('Spoonacular error', e);
        try {
          const fb = await fetchFallbackMeals();
          if (mounted) setAll(fb);
        } catch (err) {
          console.warn('Fallback error', err);
          if (mounted) setAll([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchRecipes();
    return () => {
      mounted = false;
    };
  }, []);

  const lang = 'sv';
  const t = (k) => STRINGS[lang][k] || k;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: 50 }}>
      {loading ? (
        <View style={{ paddingTop: theme.space(10), alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={{ color: theme.colors.textMuted, marginTop: theme.space(3) }}>
            {t('loading')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={all}
          key={columns}
          numColumns={columns}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <RecipeCard
              item={item}
              onPress={() => {
                setSelected(item);
                setShowModal(true);
              }}
            />
          )}
          columnWrapperStyle={columns > 1 ? { justifyContent: 'space-between' } : null}
          contentContainerStyle={{ paddingBottom: theme.space(10) }}
        />
      )}

      {/* Detaljvy som modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'flex-end'
          }}
        >
          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: '85%'
            }}
          >
            <ScrollView contentContainerStyle={{ padding: theme.inset.padding }}>
              <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 20 }}>
                {selected?.title || ''}
              </Text>
              <Text style={{ color: theme.colors.textMuted, marginTop: 4 }}>
                {selected?.minutes ? `${selected.minutes} min · ` : ''}
                {selected?.cuisine || 'world'}
              </Text>

              {selected?.image ? (
                <Image
                  source={{ uri: selected.image }}
                  style={{ width: '100%', height: 220, borderRadius: 12, marginTop: 12 }}
                />
              ) : null}

              {!!selected?.ingredients?.length && (
                <View style={{ marginTop: theme.space(4) }}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontWeight: '700',
                      fontSize: 16,
                      marginBottom: 6
                    }}
                  >
                    {t('ingredients')}
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
                      fontWeight: '700',
                      fontSize: 16,
                      marginBottom: 6
                    }}
                  >
                    {t('steps')}
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
                  flexDirection: 'row',
                  gap: 12,
                  justifyContent: 'center',
                  marginTop: theme.space(3),
                  marginBottom: theme.space(2)
                }}
              >
                <Pressable
                  onPress={async () => {
                    try {
                      const next = new Set(savedIds);
                      next.add(String(selected?.id));
                      setSavedIds(next);
                      await AsyncStorage.setItem(
                        'saved_recipes',
                        JSON.stringify(Array.from(next))
                      );
                    } catch {}
                  }}
                  style={{
                    backgroundColor: '#1F2A2F',
                    paddingVertical: theme.space(3),
                    paddingHorizontal: theme.space(6),
                    borderRadius: 999
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                    {t('saveOffline')}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setShowModal(false)}
                  style={{
                    backgroundColor: theme.colors.accent,
                    paddingVertical: theme.space(3),
                    paddingHorizontal: theme.space(6),
                    borderRadius: 999
                  }}
                >
                  <Text style={{ color: theme.colors.accentText, fontWeight: '800' }}>
                    {t('close')}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
