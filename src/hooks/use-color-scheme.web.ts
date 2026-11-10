import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const subscribe = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  // ตอน render ฝั่งเซิร์ฟเวอร์ (และรอบ hydrate แรก) ได้ false ในเบราว์เซอร์ได้ true
  // แทน useState + useEffect(setHasHydrated) ที่ setState ใน effect
  const hasHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
