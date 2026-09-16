import { createApp } from 'vue';
import { createPinia } from 'pinia';
import '@/assets/styles.css';
import App from './App.vue';
import router from './router';
import { useAuthStore, installAuthInterceptor } from '@/stores/auth';

async function bootstrap() {
  const app = createApp(App);
  app.use(createPinia());

  installAuthInterceptor(router);

  // Validate any stored session before the first guarded navigation resolves,
  // so an expired token lands on the login screen rather than a broken dashboard.
  const auth = useAuthStore();
  await auth.restore();

  app.use(router);
  app.mount('#app');
}

bootstrap();
