import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, title: 'Sign in' }
  },
  {
    path: '/',
    component: () => import('@/layouts/AppShell.vue'),
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: { title: 'Dashboard' }
      },
      {
        path: 'companies',
        name: 'companies',
        component: () => import('@/views/CompaniesView.vue'),
        meta: { title: 'Companies' }
      },
      {
        path: 'companies/:id',
        name: 'company-detail',
        component: () => import('@/views/CompanyDetailView.vue'),
        meta: { title: 'Company detail' }
      },
      {
        path: 'alerts',
        name: 'alerts',
        component: () => import('@/views/AlertsView.vue'),
        meta: { title: 'Early warning' }
      },
      {
        path: 'reports',
        name: 'reports',
        component: () => import('@/views/ReportsView.vue'),
        meta: { title: 'Reports' }
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('@/views/UsersView.vue'),
        meta: { title: 'Users', roles: ['admin'] }
      },
      {
        path: 'audit-trail',
        name: 'audit-trail',
        component: () => import('@/views/AuditTrailView.vue'),
        meta: { title: 'Audit trail', roles: ['admin'] }
      }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (to.meta.public) {
    return auth.isAuthenticated ? { name: 'dashboard' } : true;
  }

  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  if (to.meta.roles && !to.meta.roles.includes(auth.role)) {
    return { name: 'dashboard' };
  }

  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - IAS Console` : 'IAS Console';
});

export default router;
