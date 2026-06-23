// frontend/src/App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouter } from './presentation/routes/AppRouter';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  );
}

export default App;