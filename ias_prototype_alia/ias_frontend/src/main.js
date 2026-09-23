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

  const auth = useAuthStore();
  await auth.restore();

  app.use(router);
  app.mount('#app');
}

bootstrap();
