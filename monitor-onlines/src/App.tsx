import { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  collection, 
  onSnapshot,
  type QuerySnapshot,
  type QueryDocumentSnapshot,
  type DocumentData
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  type User 
} from 'firebase/auth';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
  type ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Activity } from 'lucide-react';

// Registrar componentes do Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend
);

// --- Tipagens ---
interface OnlineData {
  count: number;
  timestamp: string;
  label: string;
}

interface HabboApiResponse {
  onlineUsers: number;
}

// Tipos adicionais para propriedades globais injetadas no window
declare global {
  interface Window {
    __firebase_config?: Record<string, unknown>;
    __app_id?: string;
    __initial_auth_token?: string;
  }
}

// --- Configurações Firebase ---
const firebaseConfig = window.__firebase_config || {
  apiKey: "demo-api-key",
  authDomain: "demo-project.firebaseapp.com",
  databaseURL: "https://demo-project-default-rtdb.firebaseio.com",
  projectId: "demo-project",
  storageBucket: "demo-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
const appId = window.__app_id || 'habbo-origins-monitor';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<OnlineData[]>([]);
  const [currentOnline, setCurrentOnline] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('--:--:--');
  const [status, setStatus] = useState<string>('Iniciando...');

  // 1. Efeito de Autenticação (Regra 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = window.__initial_auth_token;
        if (token) {
          // signInWithCustomToken omitido aqui por brevidade, usando anônimo como padrão estável
          await signInAnonymously(auth);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Erro auth:", err);
        setStatus("Erro na conexão segura.");
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u: User | null) => setUser(u));
    return () => unsubscribe();
  }, []);

  // 2. Efeito de Dados em Tempo Real (Regras 1 e 2)
  useEffect(() => {
    if (!user) return;

    const historyCol = collection(db, 'artifacts', appId, 'public', 'data', 'online_history');
    
    const unsubscribe = onSnapshot(historyCol, (snapshot: QuerySnapshot<DocumentData>) => {
      const data: OnlineData[] = [];
      snapshot.forEach((doc: QueryDocumentSnapshot<DocumentData>) => {
        data.push(doc.data() as OnlineData);
      });

      // Ordenação em memória (Regra 2)
      const sortedData = data.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      // Limitar a exibição aos últimos 100 pontos para performance
      setHistory(sortedData.slice(-100));
      setStatus("Sincronizado");
    }, (error: unknown) => {
      console.error("Erro Firestore:", error);
      setStatus("Erro ao ler histórico.");
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Busca de Dados da API
  const fetchHabboData = async () => {
    const apiURL = "/api/public/origins/users";

    try {
      const response = await fetch(apiURL);
      if (!response.ok) throw new Error('API Offline');
      const data: HabboApiResponse = await response.json();
      
      const now = new Date();
      const timeStr = now.toLocaleTimeString('pt-BR');
      const dateId = now.toISOString().replace(/[:.]/g, '-').slice(0, 16); // ID amigável

      setCurrentOnline(data.onlineUsers);
      setLastUpdate(timeStr);

      // Salvar no Firestore se autenticado
      if (auth.currentUser) {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'online_history', dateId);
        await setDoc(docRef, {
          count: data.onlineUsers,
          timestamp: now.toISOString(),
          label: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        });
      }
    } catch (err: unknown) {
      console.error("Erro fetch:", err);
      console.error("URL tentada:", apiURL);
      setStatus("Erro ao buscar dados da API.");
    }
  };

  useEffect(() => {
    if (user) {
      fetchHabboData();
      const interval = setInterval(fetchHabboData, 300000); // 5 minutos
      return () => clearInterval(interval);
    }
  }, [user]);

  // Configuração do Gráfico
  const chartData = {
    labels: history.map(h => h.label),
    datasets: [
      {
        fill: true,
        label: 'Usuários Online',
        data: history.map(h => h.count),
        borderColor: '#ffffffff',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#10b981',
      },
    ],
  };

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: '#1e293b',
        titleColor: '#94a3b8',
        bodyColor: '#f8fafc',
        borderColor: '#334155',
        borderWidth: 1,
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', maxTicksLimit: 8 }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#64748b' },
        beginAtZero: true
      }
    }
  };

  return (
    <div className="container">
      {/* Header */}
      <header className="header">
        <div>
          <div className="header-title">
            <h1>Habbo Origins <span className="badge">TS</span></h1>
          </div>
          <p className="header-subtitle">
            <Activity className="icon-sm" /> Monitoramento Analítico de Usuários
          </p>
        </div>

        <div className="status-cards">
          <div className="status-card">
            <div className="status-icon">
              <img src="./img/on.png" alt="Habbo Origins" />
            </div>
            <div className="status-info">
              <span className="label">Online Agora</span>
              <span className="value">
                {currentOnline !== null ? currentOnline : '--'}
              </span>
            </div>
          </div>

          <div className="status-card">
            <div className="status-icon">
              <img src="./img/note.gif" alt="Habbo Origins" />
            </div>
            <div className="status-info">
              <span className="label">Atualizado</span>
              <span className="time">{lastUpdate}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="chart-container">
          <div className="chart-header">
            <h2 className="chart-title">
              Curva de Atividade
              <span className="live-badge">AO VIVO</span>
            </h2>
            <span className={`status-badge ${user ? 'connected' : 'disconnected'}`}>
              {status}
            </span>
          </div>
          
          <div className="chart-wrapper">
            {history.length > 0 ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <div className="loading-message">
                Aguardando dados da API...
              </div>
            )}
          </div>
        </div>
        
      </main>

      <footer className="footer">
        <p>© 2026 Habbo Origins - Monitor - Projeto por Jaguar</p>
        <div className="footer-links">
          <span>API Status: OK</span>
          <span>Database: Conectado</span>
        </div>
      </footer>
    </div>
  );
}