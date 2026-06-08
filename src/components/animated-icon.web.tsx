import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { Keyframe, Easing } from 'react-native-reanimated';

import classes from './animated-icon.module.css';
const DURATION = 300;
const SPLASH_DURATION = 1200;
const SPLASH_BACKGROUND = '#FFFFFF';
const LOGO_RATIO = 1400 / 349;
const SPLASH_LOGO_WIDTH = Math.min(Dimensions.get('screen').width - 32, 360);
const SPLASH_LOGO_HEIGHT = SPLASH_LOGO_WIDTH / LOGO_RATIO;

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), SPLASH_DURATION + 80);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: {
      opacity: 1,
      transform: [{ scale: 1 }],
    },
    62: {
      opacity: 1,
      transform: [{ scale: 1 }],
    },
    100: {
      opacity: 0,
      transform: [{ scale: 1.04 }],
      easing: Easing.out(Easing.cubic),
    },
  });

  const splashLogoKeyframe = new Keyframe({
    0: {
      opacity: 0,
      transform: [{ translateY: 14 }, { scale: 0.96 }],
    },
    18: {
      opacity: 1,
      transform: [{ translateY: 0 }, { scale: 1 }],
      easing: Easing.out(Easing.exp),
    },
    70: {
      opacity: 1,
      transform: [{ translateY: 0 }, { scale: 1 }],
    },
    100: {
      opacity: 0,
      transform: [{ translateY: -10 }, { scale: 0.98 }],
      easing: Easing.out(Easing.cubic),
    },
  });

  const blueLineKeyframe = new Keyframe({
    0: {
      opacity: 0,
      transform: [{ scaleX: 0 }],
    },
    18: {
      opacity: 0,
      transform: [{ scaleX: 0 }],
    },
    45: {
      opacity: 1,
      transform: [{ scaleX: 1 }],
      easing: Easing.out(Easing.cubic),
    },
    100: {
      opacity: 0,
      transform: [{ scaleX: 1 }],
    },
  });

  const orangeLineKeyframe = new Keyframe({
    0: {
      opacity: 0,
      transform: [{ translateX: -42 }, { scaleX: 0 }],
    },
    35: {
      opacity: 0,
      transform: [{ translateX: -42 }, { scaleX: 0 }],
    },
    58: {
      opacity: 1,
      transform: [{ translateX: 0 }, { scaleX: 1 }],
      easing: Easing.out(Easing.cubic),
    },
    100: {
      opacity: 0,
      transform: [{ translateX: 28 }, { scaleX: 1 }],
    },
  });

  return (
    <Animated.View entering={splashKeyframe.duration(SPLASH_DURATION)} style={styles.splashOverlay}>
      <Animated.View entering={splashLogoKeyframe.duration(SPLASH_DURATION)} style={styles.splashArtworkContainer}>
        <Image style={styles.splashArtwork} source={require('@/assets/images/splash-logo.png')} />
      </Animated.View>
      <View style={styles.splashLineTrack}>
        <Animated.View entering={blueLineKeyframe.duration(SPLASH_DURATION)} style={styles.splashLineBlue} />
        <Animated.View entering={orangeLineKeyframe.duration(SPLASH_DURATION)} style={styles.splashLineOrange} />
      </View>
    </Animated.View>
  );
}

const keyframe = new Keyframe({
  0: {
    transform: [{ scale: 0 }],
  },
  60: {
    transform: [{ scale: 1.2 }],
    easing: Easing.elastic(1.2),
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(1.2),
  },
});

const logoKeyframe = new Keyframe({
  0: {
    opacity: 0,
  },
  60: {
    transform: [{ scale: 1.2 }],
    opacity: 0,
    easing: Easing.elastic(1.2),
  },
  100: {
    transform: [{ scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(1.2),
  },
});

const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '-180deg' }, { scale: 0.8 }],
    opacity: 0,
  },
  [DURATION / 1000]: {
    transform: [{ rotateZ: '0deg' }, { scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(0.7),
  },
  100: {
    transform: [{ rotateZ: '7200deg' }],
  },
});

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Animated.View entering={glowKeyframe.duration(60 * 1000 * 4)} style={styles.glow}>
        <Image style={styles.glow} source={require('@/assets/images/logo-glow.png')} />
      </Animated.View>

      <Animated.View style={styles.background} entering={keyframe.duration(DURATION)}>
        <div className={classes.expoLogoBackground} />
      </Animated.View>

      <Animated.View style={styles.imageContainer} entering={logoKeyframe.duration(DURATION)}>
        <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: SPLASH_BACKGROUND,
    justifyContent: 'center',
    zIndex: 1000,
  },
  splashArtworkContainer: {
    alignItems: 'center',
    height: SPLASH_LOGO_HEIGHT,
    justifyContent: 'center',
    width: SPLASH_LOGO_WIDTH,
  },
  splashArtwork: {
    height: SPLASH_LOGO_HEIGHT,
    width: SPLASH_LOGO_WIDTH,
  },
  splashLineTrack: {
    height: 10,
    justifyContent: 'center',
    marginTop: 22,
    width: SPLASH_LOGO_WIDTH,
  },
  splashLineBlue: {
    backgroundColor: '#56599C',
    borderRadius: 999,
    height: 3,
    position: 'absolute',
    width: '100%',
  },
  splashLineOrange: {
    backgroundColor: '#F47F20',
    borderRadius: 999,
    height: 5,
    position: 'absolute',
    width: '42%',
  },
  container: {
    alignItems: 'center',
    width: '100%',
    zIndex: 1000,
    position: 'absolute',
    top: 128 / 2 + 138,
  },
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    width: 201,
    height: 201,
    position: 'absolute',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
  },
  image: {
    position: 'absolute',
    width: 76,
    height: 71,
  },
  background: {
    width: 128,
    height: 128,
    position: 'absolute',
  },
});
