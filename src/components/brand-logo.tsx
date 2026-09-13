import { Image, type ImageProps } from 'expo-image';
import { useAppTheme } from '@/theme/theme-provider';
export function BrandLogo(props: Omit<ImageProps, 'source'>) {
  const { scheme } = useAppTheme();
  return <Image {...props} source={scheme === 'dark' ? require('../../assets/brand/logo-dark.png') : require('../../assets/brand/logo.png')} />;
}
