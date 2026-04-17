import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Plus, 
  FileText, 
  MapPin, 
  Calendar, 
  Hash, 
  User, 
  LogOut, 
  GripHorizontal, 
  Filter, 
  ClipboardCheck,
  Package,
  Clock,
  ExternalLink,
  ChevronDown,
  X,
  MessageSquare,
  Send,
  ArrowRight
} from 'lucide-react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  Timestamp, 
  serverTimestamp, 
  orderBy,
  doc,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { db, auth } from './firebase';
import { format, differenceInDays } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

interface ContainerRecord {
  id: string;
  containerNumber: string;
  ownerCode: string;
  asnNumber: string;
  soNumber: string;
  goodsName: string;
  status: 'active' | 'shipped';
  location: {
    yard: string;
    zone: string;
    row: string;
    tier: string;
  };
  gateInDate: any;
  gateOutDate?: any;
  authorUid: string;
  createdAt: any;
}

interface ChatMessage {
  id: string;
  text: string;
  senderUid: string;
  senderName: string;
  senderPhoto: string;
  createdAt: any;
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [records, setRecords] = useState<ContainerRecord[]>([]);
  const [showShipped, setShowShipped] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Search state
  const [searchContainer, setSearchContainer] = useState('');
  const [searchOwner, setSearchOwner] = useState('');
  const [appliedSearch, setAppliedSearch] = useState({ container: '', owner: '' });
  
  // Auth state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [lastSeenMsgId, setLastSeenMsgId] = useState<string | null>(localStorage.getItem('lastSeenMsgId'));
  
  // Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ContainerRecord | null>(null);
  const [editSoValue, setEditSoValue] = useState('');
  const [newRecord, setNewRecord] = useState({
    containerNumber: '',
    ownerCode: '',
    asnNumber: '',
    goodsName: '',
    yard: '',
    zone: '',
    row: '',
    tier: ''
  });

  // Auth Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Sync Logic
  useEffect(() => {
    if (!user) {
      setRecords([]);
      return;
    }

    const q = query(collection(db, 'containers'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ContainerRecord[];
      setRecords(data);
    }, (error) => {
      console.error("Firestore sync error:", error);
    });

    return unsubscribe;
  }, [user]);

  // Chat Sync
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'chat'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      setMessages(data);
    });
    return unsubscribe;
  }, [user]);

  const handleEnterStation = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    const cleanPass = password.trim();
    
    if (!cleanUser || !cleanPass) return;
    
    setIsAuthenticating(true);
    setAuthError('');

    // Smooth internal handling: satisfies Firebase 6-char limit and email format
    const email = `${cleanUser.toLowerCase().replace(/\s+/g, '.')}@port.internal`;
    const internalPass = cleanPass.length < 6 ? `${cleanPass}#port.ops` : cleanPass;

    try {
      try {
        await signInWithEmailAndPassword(auth, email, internalPass);
      } catch (signInErr: any) {
        if (signInErr.code === 'auth/operation-not-allowed') {
          setAuthError('Firebase Setup Required: Please enable "Email/Password" in your Firebase Auth console.');
          return;
        }
        // Auto-create if not found or if creds invalid
        if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') {
          try {
            const userCred = await createUserWithEmailAndPassword(auth, email, internalPass);
            await updateProfile(userCred.user, { displayName: cleanUser });
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              setAuthError('Access Denied: Incorrect password for this personnel.');
            } else {
              throw createErr;
            }
          }
        } else if (signInErr.code === 'auth/wrong-password') {
          setAuthError('Access Denied: Incorrect password.');
        } else {
          throw signInErr;
        }
      }
    } catch (error: any) {
      console.error("Entrance Error:", error);
      setAuthError('System sync error. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessage.trim()) return;

    try {
      const docRef = await addDoc(collection(db, 'chat'), {
        text: newMessage,
        senderUid: user.uid,
        senderName: user.displayName,
        senderPhoto: user.photoURL,
        createdAt: serverTimestamp()
      });
      setNewMessage('');
      // Auto-mark as seen if sending
      setLastSeenMsgId(docRef.id);
      localStorage.setItem('lastSeenMsgId', docRef.id);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const toggleChat = () => {
    setIsChatOpen(!isChatOpen);
    if (!isChatOpen && messages.length > 0) {
      const lastId = messages[messages.length - 1].id;
      setLastSeenMsgId(lastId);
      localStorage.setItem('lastSeenMsgId', lastId);
    }
  };

  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await addDoc(collection(db, 'containers'), {
        ...newRecord,
        status: 'active',
        location: {
          yard: newRecord.yard,
          zone: newRecord.zone,
          row: newRecord.row,
          tier: newRecord.tier
        },
        gateInDate: serverTimestamp(),
        authorUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setIsAddModalOpen(false);
      setNewRecord({
        containerNumber: '',
        ownerCode: '',
        asnNumber: '',
        soNumber: '',
        goodsName: '',
        yard: '',
        zone: '',
        row: '',
        tier: ''
      });
    } catch (error) {
      console.error("Error adding record:", error);
    }
  };

  const handleSearch = () => {
    setAppliedSearch({ container: searchContainer, owner: searchOwner });
  };

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const matchStatus = showShipped ? r.status === 'shipped' : r.status === 'active';
      const matchContainer = r.containerNumber.toLowerCase().includes(appliedSearch.container.toLowerCase());
      const matchOwner = r.ownerCode.toLowerCase().includes(appliedSearch.owner.toLowerCase());
      return matchStatus && matchContainer && matchOwner;
    });
  }, [records, appliedSearch, showShipped]);

  const handleUpdateSO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;

    try {
      const docRef = doc(db, 'containers', editingRecord.id);
      await updateDoc(docRef, {
        soNumber: editSoValue,
        updatedAt: serverTimestamp()
      });
      setIsEditModalOpen(false);
      setEditingRecord(null);
      setEditSoValue('');
    } catch (error) {
      console.error("Error updating SO:", error);
    }
  };

  const openEditSo = (record: ContainerRecord) => {
    setEditingRecord(record);
    setEditSoValue(record.soNumber || '');
    setIsEditModalOpen(true);
  };

  const handleShipOut = async (id: string, containerNo: string) => {
    try {
      const docRef = doc(db, 'containers', id);
      await updateDoc(docRef, {
        status: 'shipped',
        gateOutDate: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      // Optional: Visual feedback if needed, but Firestore listener will update the list
    } catch (error) {
      console.error("Ship out error:", error);
    }
  };

  const copyForExcel = () => {
    const headers = ['Container #', 'Owner', 'ASN', 'SO', 'Goods', 'Location', 'Gate-In', 'Life (Days)'];
    const rows = filteredRecords.map(r => {
      const gateIn = r.gateInDate?.toDate ? r.gateInDate.toDate() : new Date();
      const life = differenceInDays(new Date(), gateIn);
      return [
        r.containerNumber,
        r.ownerCode,
        r.asnNumber,
        r.soNumber,
        r.goodsName,
        `${r.location.yard || 'N/A'}-${r.location.zone}-${r.location.row}-${r.location.tier}`,
        format(gateIn, 'yyyy-MM-dd'),
        life
      ].join('\t');
    });

    const content = [headers.join('\t'), ...rows].join('\n');
    navigator.clipboard.writeText(content);
    alert('Copied to clipboard as TSV (Tab Separated Values) for Excel.');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass p-12 max-w-sm w-full space-y-10 glow-cosy"
        >
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="p-4 bg-blue-500/10 rounded-full">
                <GripHorizontal className="w-10 h-10 text-blue-400" />
              </div>
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-[0.2em] text-white uppercase">Port Access</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Secure Command Terminal</p>
            </div>
          </div>

          <form onSubmit={handleEnterStation} className="space-y-5 text-left">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 ml-1">Dispatcher Name</label>
              <input 
                required
                type="text"
                placeholder="Enter Your Name"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="cosy-input w-full text-center tracking-wider text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 ml-1">Access Pass</label>
              <input 
                required
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="cosy-input w-full text-center tracking-widest text-white"
              />
            </div>
            
            {authError && (
              <p className="text-[10px] text-red-400 bg-red-500/5 p-3 rounded-lg border border-red-500/10 text-center font-bold uppercase tracking-wider">
                {authError}
              </p>
            )}

            <button 
              type="submit"
              disabled={isAuthenticating}
              className="cosy-btn w-full py-4 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isAuthenticating ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                'Sync Station'
              )}
            </button>
          </form>

          <p className="text-[9px] text-slate-600 uppercase font-black tracking-widest leading-relaxed">
            New personnel? Use your name to start.<br/>
            No complex setup required.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10 pb-24">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/10">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-[2px] text-blue-400 uppercase">PORT OPS CENTER</h1>
          <div className="flex items-center gap-2 text-slate-400">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[0.75rem] font-medium rounded-full">REAL-TIME SYSTEM ACTIVE</span>
            <span className="text-[0.8rem] font-mono tracking-tight ml-2">{format(new Date(), 'MMM dd, yyyy')}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 pr-4 border-r border-slate-800">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-white">{user.displayName}</p>
              <p className="text-xs text-slate-500">Document Clerk</p>
            </div>
            <img 
              src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=0D8ABC&color=fff`} 
              alt="" 
              className="w-10 h-10 rounded-xl border border-white/10" 
              referrerPolicy="no-referrer" 
            />
          </div>
          <button 
            onClick={handleLogout}
            className="p-3 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl transition-colors"
            title="Log out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Primary Search Controls */}
      <section className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto_auto] gap-4 p-5 glass glow-cosy">
        <div className="space-y-2">
          <label className="text-[0.7rem] uppercase tracking-widest font-bold text-slate-400 ml-1">Container Number</label>
          <div className="relative">
            <input 
              type="text"
              placeholder="Filter Container"
              value={searchContainer}
              onChange={(e) => setSearchContainer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="cosy-input w-full"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[0.7rem] uppercase tracking-widest font-bold text-slate-400 ml-1">Owner Code</label>
          <div className="relative">
            <input 
              type="text"
              placeholder="Filter Owner"
              value={searchOwner}
              onChange={(e) => setSearchOwner(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="cosy-input w-full uppercase"
            />
          </div>
        </div>
        <div className="flex items-end pt-2 md:pt-0">
          <button 
            onClick={handleSearch}
            className="h-[46px] px-6 bg-slate-800 border border-slate-700 text-white rounded-xl hover:bg-slate-700 transition-all flex items-center justify-center gap-2 font-bold uppercase text-[10px] tracking-widest"
          >
            <Search className="w-4 h-4" />
            Search
          </button>
        </div>
        <div className="flex items-end pt-2 md:pt-0">
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="cosy-btn h-[46px] px-8"
          >
            Record Entry
          </button>
        </div>
        <div className="flex items-center gap-2 pt-2 md:pt-0 self-end">
          <button 
            onClick={copyForExcel}
            className="h-[46px] w-[46px] flex items-center justify-center bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl transition-all hover:bg-blue-500/20"
            title="Copy for Excel"
          >
            <ClipboardCheck className="w-5 h-5" />
          </button>
          <button 
            onClick={toggleChat}
            className="h-[46px] w-[46px] flex items-center justify-center bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl transition-all hover:bg-blue-500/20 relative"
            title="Open Chat"
          >
            <MessageSquare className="w-5 h-5" />
            {messages.length > 0 && messages[messages.length - 1].id !== lastSeenMsgId && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse" />
            )}
          </button>
        </div>
      </section>

      {/* Main Grid */}
      <main className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-6">
            <h2 className="text-lg font-bold flex items-center gap-2 tracking-widest uppercase text-slate-400">
              <GripHorizontal className="w-5 h-5 text-blue-500" />
              {showShipped ? 'Ship-Out Archive' : 'Operational Registry'}
              <span className="text-xs bg-blue-500/10 px-2 py-0.5 rounded-full text-blue-400 border border-blue-500/20">
                {filteredRecords.length} {showShipped ? 'Total' : 'Active'}
              </span>
            </h2>
            <button 
              onClick={() => setShowShipped(!showShipped)}
              className={cn(
                "px-4 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2",
                showShipped 
                  ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                  : "bg-slate-800 text-slate-400 hover:text-white border border-white/5"
              )}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              {showShipped ? 'Exit Archive' : 'View Shipped Out'}
            </button>
          </div>
        </div>

        <AnimatePresence mode="popLayout">
          {filteredRecords.length === 0 ? (
            <motion.div 
               key="empty"
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="glass p-12 text-center rounded-3xl"
            >
              <FileText className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-300">No Records Found</h3>
              <p className="text-slate-500">
                {showShipped 
                  ? "The archive is empty. Start shipping out containers to see them here." 
                  : "Try adjusting your search filters or record a new entry."}
              </p>
            </motion.div>
          ) : (
            <div key="list" className="flex flex-col gap-3">
              {filteredRecords.map((record) => {
                const gateIn = record.gateInDate?.toDate ? record.gateInDate.toDate() : new Date();
                const gateOut = record.gateOutDate?.toDate ? record.gateOutDate.toDate() : (record.status === 'shipped' ? new Date() : null);
                
                const durationEnd = gateOut || new Date();
                const diffMs = durationEnd.getTime() - gateIn.getTime();
                const totalMinutes = Math.floor(diffMs / (1000 * 60));
                const days = Math.floor(totalMinutes / (24 * 60));
                const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
                const minutes = totalMinutes % 60;

                const isUrgent = record.status === 'active' && days >= 7;

                return (
                  <motion.div
                    key={record.id}
                    layout
                    initial={{ opacity: 0, scale: 0.99 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.99 }}
                    className={cn(
                      "glass px-6 py-4 rounded-2xl border border-white/5 relative overflow-hidden group transition-all hover:bg-slate-900/60",
                      isUrgent && "border-red-500/30 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.15)]",
                      record.status === 'shipped' && "opacity-80 grayscale-[0.2] border-emerald-500/10"
                    )}
                  >
                    <div className="flex flex-col gap-4">
                      {/* FIRST ROW: CONTAINER NUMBER, OWNER CODE, AND SO */}
                      <div className="flex items-center justify-between border-b border-white/5 pb-3">
                        <div className="flex items-center gap-12">
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "w-1.5 h-8 rounded-full",
                              record.status === 'shipped' ? "bg-emerald-500" : (isUrgent ? "bg-red-500 animate-pulse" : "bg-blue-500")
                            )} />
                            <div className="flex flex-col -space-y-1">
                               <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Container ID</span>
                               <span className="font-mono text-3xl font-black text-white uppercase tracking-tighter">{record.containerNumber}</span>
                            </div>
                          </div>

                          <div className="flex flex-col -space-y-1">
                             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Owner Code</span>
                             <span className="text-2xl font-black text-blue-400 font-mono tracking-tight">{record.ownerCode}</span>
                          </div>

                          <div className="flex flex-col -space-y-1 border-l border-white/10 pl-12">
                             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Shipping Order (SO)</span>
                             <span className={cn(
                               "text-2xl font-black font-mono",
                               record.soNumber ? "text-emerald-400" : "text-slate-700 italic"
                             )}>
                               {record.soNumber || 'PENDING'}
                             </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                           {record.status === 'active' ? (
                             <>
                               <button 
                                 onClick={() => openEditSo(record)}
                                 className="p-3 text-blue-400 hover:text-white rounded-xl transition-all bg-white/5 border border-white/10 hover:border-blue-500/50"
                                 title="Update SO #"
                               >
                                 <Plus className="w-5 h-5" />
                               </button>
                               <button 
                                 onClick={() => handleShipOut(record.id, record.containerNumber)}
                                 className="flex items-center gap-3 px-8 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-500/40 font-black uppercase text-xs tracking-widest border border-emerald-400/30 active:scale-95"
                               >
                                 <ExternalLink className="w-4 h-4" />
                                 Ship Out
                               </button>
                             </>
                           ) : (
                             <div className="flex items-center gap-3 px-6 py-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-500">
                               <ClipboardCheck className="w-5 h-5" />
                               <span className="text-xs font-black uppercase tracking-widest">Shipment Finalized</span>
                             </div>
                           )}
                        </div>
                      </div>

                      {/* SECOND ROW: INBOUND DATE/TIME, OUTBOUND DATE/TIME, STAY DURATION */}
                      <div className="flex items-center gap-16 text-slate-400">
                        <div className="flex items-center gap-6">
                           <div className="flex flex-col">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Inbound Date/Time</span>
                              <div className="flex items-center gap-2 text-slate-200 bg-white/5 border border-white/5 rounded-lg px-3 py-1.5">
                                <Calendar className="w-4 h-4 text-blue-500" />
                                <span className="font-mono text-sm font-bold">{format(gateIn, 'yyyy-MM-dd HH:mm:ss')}</span>
                              </div>
                           </div>
                           
                           <div className="text-slate-700 pt-4">
                              <ArrowRight className="w-5 h-5" />
                           </div>

                           <div className="flex flex-col">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Outbound Date/Time</span>
                              <div className={cn(
                                "flex items-center gap-2 rounded-lg px-3 py-1.5 border",
                                gateOut ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400" : "bg-white/5 border-white/5 text-slate-600"
                              )}>
                                <Clock className="w-4 h-4" />
                                {gateOut ? (
                                  <span className="font-mono text-sm font-bold">{format(gateOut, 'yyyy-MM-dd HH:mm:ss')}</span>
                                ) : (
                                  <span className="text-xs font-black italic tracking-widest uppercase">POSSESSION</span>
                                )}
                              </div>
                           </div>

                           {/* Added Position here since User didn't specify Row 2 location but it's important */}
                           <div className="flex flex-col ml-4">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Yard Position</span>
                              <div className="flex items-center gap-2 bg-white/5 border border-white/5 rounded-lg px-3 py-1.5 text-slate-400">
                                <MapPin className="w-4 h-4 text-slate-600" />
                                <span className="font-mono text-sm font-bold uppercase">{record.location.yard}-{record.location.zone}-{record.location.row}-{record.location.tier}</span>
                              </div>
                           </div>
                        </div>

                        <div className="flex-1" />

                        <div className="flex flex-col items-end">
                           <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 leading-none">Stay Duration</span>
                           <div className={cn(
                             "text-3xl font-black tracking-tight font-mono flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2 border border-white/5",
                             isUrgent ? "text-red-500 border-red-500/20" : (record.status === 'shipped' ? "text-emerald-500 border-emerald-500/20" : "text-blue-500 border-blue-500/20")
                           )}>
                             <div className="flex items-baseline gap-1">
                               <span>{days}</span><span className="text-[12px] opacity-40 uppercase font-black">Day</span>
                             </div>
                             <div className="flex items-baseline gap-1">
                               <span>{hours}</span><span className="text-[12px] opacity-40 uppercase font-black">Hr</span>
                             </div>
                             <div className="flex items-baseline gap-1">
                               <span>{minutes}</span><span className="text-[12px] opacity-40 uppercase font-black">Min</span>
                             </div>
                           </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* Group Chat Sidebar */}
      <AnimatePresence>
        {isChatOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsChatOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-slate-900 border-l border-white/5 shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-800/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <MessageSquare className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="font-bold text-white uppercase tracking-wider">Group Comms</h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest tracking-[1px]">Operational Channel</p>
                  </div>
                </div>
                <button onClick={toggleChat} className="p-2 hover:bg-white/5 rounded-full text-slate-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {messages.map((msg, i) => {
                  const isMe = msg.senderUid === user.uid;
                  const showHeader = i === 0 || messages[i-1].senderUid !== msg.senderUid;
                  
                  return (
                    <div key={msg.id} className={cn("flex flex-col gap-1", isMe ? "items-end" : "items-start")}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-[8px] font-bold text-white">
                            {msg.senderName?.charAt(0)}
                          </div>
                          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{msg.senderName}</span>
                        </div>
                      <div className={cn(
                        "p-3 px-4 rounded-2xl max-w-[85%] text-sm leading-relaxed",
                        isMe 
                          ? "bg-blue-600 text-white rounded-tr-none" 
                          : "bg-slate-800 text-slate-200 rounded-tl-none border border-white/5"
                      )}>
                        {msg.text}
                      </div>
                      {showHeader && (
                         <span className="text-[8px] text-slate-600 font-bold uppercase mt-1">
                            {msg.createdAt?.toDate ? format(msg.createdAt.toDate(), 'HH:mm') : 'Just now'}
                         </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <form onSubmit={handleSendMessage} className="p-6 border-t border-white/5 bg-slate-900/50">
                <div className="relative">
                  <input 
                    type="text"
                    placeholder="Type a group message..."
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/30 rounded-xl py-4 pl-5 pr-14 focus:outline-none focus:border-blue-500 transition-all text-sm"
                  />
                  <button 
                    type="submit"
                    className="absolute right-2 top-2 bottom-2 w-10 flex items-center justify-center bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/40"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Meta */}
      <footer className="pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-slate-600 font-medium uppercase tracking-widest">
          &copy; {new Date().getFullYear()} Dry Port Logistics Systems v2.4 
        </p>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sync Active</span>
          </div>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Secured by Cloud Firestore</p>
        </div>
      </footer>

      {/* Add Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="glass max-w-2xl w-full rounded-[2rem] overflow-hidden relative"
            >
              <div className="flex items-center justify-between p-8 border-b border-white/5 bg-blue-600/5">
                <div className="flex items-center gap-4">
                   <div className="p-2.5 bg-blue-500/20 rounded-xl">
                      <Plus className="w-6 h-6 text-blue-400" />
                   </div>
                   <h2 className="text-2xl font-bold text-white tracking-tight uppercase">Execute Entry</h2>
                </div>
                <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleAddRecord} className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                     <label className="text-[0.7rem] uppercase tracking-widest font-black text-blue-400 ml-1">Container Number *</label>
                     <input 
                       required
                       type="text"
                       placeholder="MSKU-129048-2"
                       value={newRecord.containerNumber}
                       onChange={e => setNewRecord({...newRecord, containerNumber: e.target.value.toUpperCase()})}
                       className="w-full bg-black/40 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-blue-500 transition-all font-mono"
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-[0.7rem] uppercase tracking-widest font-black text-blue-400 ml-1">Owner Code *</label>
                     <input 
                       required
                       type="text"
                       placeholder="MAEU"
                       value={newRecord.ownerCode}
                       onChange={e => setNewRecord({...newRecord, ownerCode: e.target.value.toUpperCase()})}
                       className="w-full bg-black/40 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-blue-500 transition-all font-mono"
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-[0.7rem] uppercase tracking-widest font-black text-blue-400 ml-1">ASN Number *</label>
                     <input 
                       required
                       type="text"
                       placeholder="E.g. ASN-9902"
                       value={newRecord.asnNumber}
                       onChange={e => setNewRecord({...newRecord, asnNumber: e.target.value})}
                       className="w-full bg-black/40 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-blue-500 transition-all font-mono"
                     />
                  </div>
                </div>

                <div className="space-y-2">
                   <label className="text-[0.7rem] uppercase tracking-widest font-black text-blue-400 ml-1">Placement Details *</label>
                   <div className="grid grid-cols-4 gap-4">
                     <input 
                       required
                       placeholder="Yard"
                       value={newRecord.yard}
                       onChange={e => setNewRecord({...newRecord, yard: e.target.value.toUpperCase()})}
                       className="bg-black/40 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-blue-500 font-mono"
                     />
                     <input 
                       required
                       placeholder="Zone"
                       value={newRecord.zone}
                       onChange={e => setNewRecord({...newRecord, zone: e.target.value.toUpperCase()})}
                       className="bg-black/40 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-blue-500 font-mono"
                     />
                     <input 
                       required
                       placeholder="Row"
                       value={newRecord.row}
                       onChange={e => setNewRecord({...newRecord, row: e.target.value.toUpperCase()})}
                       className="bg-black/40 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-blue-500 font-mono"
                     />
                     <input 
                       required
                       placeholder="Tier"
                       value={newRecord.tier}
                       onChange={e => setNewRecord({...newRecord, tier: e.target.value.toUpperCase()})}
                       className="bg-black/40 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-blue-500 font-mono"
                     />
                   </div>
                </div>

                <div className="space-y-2">
                   <label className="text-[0.7rem] uppercase tracking-widest font-black text-blue-400 ml-1">Manifest Description</label>
                   <textarea 
                     rows={3}
                     placeholder="Item names and quantity summary..."
                     value={newRecord.goodsName}
                     onChange={e => setNewRecord({...newRecord, goodsName: e.target.value})}
                     className="w-full bg-black/40 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-blue-500 transition-all resize-none"
                   />
                </div>

                <div className="flex gap-4 pt-4 border-t border-white/5">
                  <button 
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 py-4 font-bold text-slate-500 hover:text-white transition-colors uppercase text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] bg-blue-600 hover:bg-blue-500 py-4 font-bold text-white rounded-xl transition-all shadow-xl shadow-blue-600/20 active:scale-95 uppercase text-sm tracking-widest"
                  >
                    Execute Commit
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Update SO Modal */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="glass max-w-md w-full rounded-[2rem] overflow-hidden relative"
            >
              <div className="flex items-center justify-between p-8 border-b border-white/5 bg-emerald-600/5">
                <div className="flex items-center gap-4">
                   <div className="p-2.5 bg-emerald-500/20 rounded-xl">
                      <ClipboardCheck className="w-6 h-6 text-emerald-400" />
                   </div>
                   <h2 className="text-2xl font-bold text-white tracking-tight uppercase">Update SO #</h2>
                </div>
                <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleUpdateSO} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                     <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Target Container</p>
                     <p className="text-lg font-mono font-bold text-blue-400">{editingRecord?.containerNumber}</p>
                  </div>

                  <div className="space-y-2">
                     <label className="text-[0.7rem] uppercase tracking-widest font-black text-emerald-400 ml-1">Shipping Order (SO) Number</label>
                     <input 
                       required
                       autoFocus
                       type="text"
                       placeholder="Enter SO Number..."
                       value={editSoValue}
                       onChange={e => setEditSoValue(e.target.value.toUpperCase())}
                       className="w-full bg-black/40 border border-white/10 rounded-xl py-4 px-5 focus:outline-none focus:border-emerald-500 transition-all font-mono text-white text-lg"
                     />
                     <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight px-1">Update this after vessel booking is confirmed.</p>
                  </div>
                </div>

                <div className="flex gap-4 pt-4 border-t border-white/5">
                  <button 
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="flex-1 py-4 font-bold text-slate-500 hover:text-white transition-colors uppercase text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] bg-emerald-600 hover:bg-emerald-500 py-4 font-bold text-white rounded-xl transition-all shadow-xl shadow-emerald-600/20 active:scale-95 uppercase text-sm tracking-widest"
                  >
                    Update Record
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
