import { customAlert, customConfirm } from '../../components/CustomPrompt/CustomPrompt';
import React, { useState, useEffect } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { X, Folder, Image as ImageIcon, Share2, ChevronDown, ChevronRight, Loader2, RefreshCw, Trash2, Search, Cloud, CheckCircle, Clock, CloudUpload } from 'lucide-react';
import { buscarCondominios } from '../../services/condominioService';
import { supabase } from '../../services/supabase';
import { filesystemService } from '../../services/filesystemService';
import { readFilaSync } from '../../services/syncService';
import './BackupFotosMenu.css';

const sanitizeName = (name) => {
  if (!name) return 'Desconhecido';
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
};

const BackupFotosMenu = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('offline'); // 'offline' | 'online'

  // ================= Offline State =================
  const [condominios, setCondominios] = useState([]);
  const [isLoadingOffline, setIsLoadingOffline] = useState(false);
  const [expandedCondo, setExpandedCondo] = useState(null);
  const [isSharing, setIsSharing] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState(null);

  // ================= Online State =================
  const [searchQuery, setSearchQuery] = useState('');
  const [onlinePhotos, setOnlinePhotos] = useState([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [fotosSelecionadas, setFotosSelecionadas] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [expandedCondoOnline, setExpandedCondoOnline] = useState(null);

  const toggleCondoOnline = (pathFisico) => {
    setExpandedCondoOnline(prev => prev === pathFisico ? null : pathFisico);
  };

  useEffect(() => {
    const handleSyncStatus = (e) => {
      setIsSyncing(e.detail?.syncing || false);
    };
    const handleAtualizadas = () => {
      // Re-fetch online tab when sync finishes an item
      window.dispatchEvent(new CustomEvent('refreshOnlineTab'));
    };
    window.addEventListener('syncStatus', handleSyncStatus);
    window.addEventListener('leiturasAtualizadas', handleAtualizadas);
    return () => {
      window.removeEventListener('syncStatus', handleSyncStatus);
      window.removeEventListener('leiturasAtualizadas', handleAtualizadas);
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'online') {
      const delayDebounceFn = setTimeout(() => {
        handleSearchOnline();
      }, 500);

      const doRefresh = () => handleSearchOnline();
      window.addEventListener('refreshOnlineTab', doRefresh);

      return () => {
        clearTimeout(delayDebounceFn);
        window.removeEventListener('refreshOnlineTab', doRefresh);
      };
    }
  }, [searchQuery, activeTab]);

  const toggleFotoSelecao = (id) => {
    setFotosSelecionadas(prev => 
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    if (isOpen && activeTab === 'offline') {
      carregarPastas();
    }

    const handleLeiturasUpdated = () => {
      if (isOpen && activeTab === 'offline') {
        carregarPastas();
      }
    };

    window.addEventListener('leiturasAtualizadas', handleLeiturasUpdated);
    return () => window.removeEventListener('leiturasAtualizadas', handleLeiturasUpdated);
  }, [isOpen, activeTab]);

  // ================= Offline Functions =================
  const carregarPastas = async () => {
    setIsLoadingOffline(true);
    console.log('[BackupFotosMenu] Iniciando leitura da raiz de backups...');
    try {
      let files = [];
      try {
        files = await filesystemService.listarLotes();
      } catch (err) {
        console.warn('[BackupFotosMenu] Raiz não encontrada ou vazia. Retornando silenciosamente.', err);
        setCondominios([]);
        setIsLoadingOffline(false);
        return;
      }
      
      console.log(`[BackupFotosMenu] Encontradas ${files.length} pastas na raiz.`);

      let dbCondominios = [];
      try {
        dbCondominios = await buscarCondominios();
      } catch (e) {}

      const filaSync = readFilaSync();

      const pastasEncontradas = await Promise.all(
        files.map(async (pasta) => {
          const nomePasta = pasta.name || pasta;
          console.log(`[BackupFotosMenu] Lendo pasta do condomínio: ${nomePasta}`);
          try {
            const rawArquivos = await filesystemService.listarFotosLote(nomePasta);
            
            const filesData = await Promise.all(
              rawArquivos.map(async (arquivo) => {
                const fName = arquivo.name || arquivo;
                if (fName.endsWith('.jpg') || fName.endsWith('.jpeg') || fName.endsWith('.png')) {
                   const sourcePath = `Backups/${nomePasta}/${fName}`;
                   // Lê o URI e usa Capacitor para gerar caminho WebView
                   const uriResult = await Filesystem.getUri({
                     path: sourcePath,
                     directory: Directory.Data
                   });
                   const webPath = Capacitor.convertFileSrc(uriResult.uri);

                   const isPending = filaSync.some(item => item.fileName === sourcePath || (item.fileName && item.fileName.endsWith(fName)));

                   return {
                      name: fName,
                      dataUrl: webPath,
                      isPending: isPending
                   };
                }
                return null;
              })
            );

            const validFiles = filesData.filter(Boolean);
            console.log(`[BackupFotosMenu] Pasta ${nomePasta} processou ${validFiles.length} arquivos.`);

            if (validFiles.length > 0) {
              const matchedCondo = dbCondominios.find(c => filesystemService.sanitizeName(c.nome) === nomePasta);
              const nomeOriginal = matchedCondo ? matchedCondo.nome : nomePasta.replace(/_/g, ' ');

              return {
                nome: nomeOriginal,
                pathFisico: nomePasta,
                arquivos: validFiles
              };
            }
          } catch (e) {
            console.error(`[BackupFotosMenu] Erro ao processar a pasta ${nomePasta}:`, e);
          }
          return null;
        })
      );

      const resultadosFinais = pastasEncontradas.filter(Boolean);
      console.log(`[BackupFotosMenu] Leitura concluída. Atualizando estado com ${resultadosFinais.length} condomínios.`);
      setCondominios(resultadosFinais);

    } catch (e) {
      console.error('[BackupFotosMenu] Erro geral na leitura das pastas:', e);
      setCondominios([]);
    } finally {
      setIsLoadingOffline(false);
    }
  };

  const toggleCondo = (pathFisico) => {
    if (expandedCondo === pathFisico) {
      setExpandedCondo(null);
    } else {
      setExpandedCondo(pathFisico);
    }
  };

  const handleCompartilhar = async (condo) => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const fileUris = [];

      for (let i = 0; i < condo.arquivos.length; i++) {
        const fileName = condo.arquivos[i].name;
        const sourcePath = `Backups/${condo.pathFisico}/${fileName}`;
        const tempFileName = `share_lote_${condo.pathFisico}_${i}.jpg`;
        
        try {
          const base64Data = await filesystemService.lerFotoBase64(sourcePath);
          const base64Pure = base64Data.replace(/^data:image\/[a-z]+;base64,/, "");

          const savedFile = await Filesystem.writeFile({
            path: tempFileName,
            data: base64Pure,
            directory: Directory.Cache,
            recursive: true
          });
          
          const localUri = savedFile.uri.startsWith('file://') ? savedFile.uri : `file://${savedFile.uri}`;
          fileUris.push(localUri);
        } catch (err) {}
      }

      if (fileUris.length === 0) {
        return;
      }

      await Share.share({
        dialogTitle: `Lote: ${condo.nome}`,
        files: fileUris
      });

    } catch (e) {
      console.log('Compartilhamento cancelado ou falhou:', e);
    } finally {
      setIsSharing(false);
    }
  };

  const handleExcluirLote = async (e, condo) => {
    e.stopPropagation();
    if (!await customConfirm("Deseja realmente excluir este lote de fotos do dispositivo?")) return;

    try {
      await filesystemService.excluirLote(condo.pathFisico);
      setCondominios(prev => prev.filter(c => c.pathFisico !== condo.pathFisico));
      
      if (expandedCondo === condo.pathFisico) {
        setExpandedCondo(null);
      }
    } catch (err) {
      await customAlert('Ocorreu um erro ao excluir o lote: ' + err.message);
    }
  };

  // ================= Online Functions =================
  const handleSearchOnline = async (e) => {
    if (e) e.preventDefault();

    setIsSearchingOnline(true);
    setSearchError('');
    setOnlinePhotos([]);

    try {
      const { data: sessionData } = await supabase.auth.getUser();
      const userId = sessionData?.user?.id;

      let query = supabase.from('leituras_detalhes').select('*');
      if (userId) {
        query = query.eq('leiturista_id', userId);
      }

      if (searchQuery.trim()) {
        query = query.ilike('condominio_nome', `%${searchQuery.trim()}%`);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      
      // Filter photos that have a foto_url (somente banco online real)
      const dbPhotos = (data || []).filter(item => item.foto_url);
      
      // Merge with pending items from syncService
      const filaSync = readFilaSync();
      const localPending = filaSync.map(item => ({
         ...item,
         isPending: true,
         foto_url: null,
         id: item.id,
         created_at: item.timestamp
      }));

      const allPhotos = [...localPending, ...dbPhotos];
      const photos = allPhotos.filter(item => {
         if (!searchQuery.trim()) return true;
         return item.condominio_nome && item.condominio_nome.toLowerCase().includes(searchQuery.trim().toLowerCase());
      });

      setOnlinePhotos(photos);
      
      if (photos.length === 0) {
          setSearchError('Nenhuma foto encontrada.');
      }
    } catch (err) {
      if (err.message && (err.message.includes('Failed to fetch') || err.message.toLowerCase().includes('network'))) {
        setSearchError('Modo Offline: Suas fotos estão salvas com segurança no aparelho e serão enviadas quando a internet retornar.');
      } else {
        setSearchError('Erro ao buscar fotos online: ' + err.message);
      }
    } finally {
      setIsSearchingOnline(false);
    }
  };

      useEffect(() => {
    // Moved to the top to avoid re-declaring multiple effects with activeTab logic.
  }, []);

  const handleShareWhatsAppOnline = async (itemClicked) => {
    if (isSharing) return;
    setIsSharing(true);

    let itemsToShare = [];

    if (fotosSelecionadas.length > 0) {
      itemsToShare = onlinePhotos.filter(p => fotosSelecionadas.includes(p.id));
    } else if (itemClicked) {
      itemsToShare = [itemClicked];
    }

    if (itemsToShare.length === 0) {
      setIsSharing(false);
      return;
    }

    try {
      const arquivosLocais = [];

      for (let i = 0; i < itemsToShare.length; i++) {
        const item = itemsToShare[i];
        const tempFileName = `share_online_${item.id || Date.now()}_${i}.jpg`;
        const foto_url = item.foto_url;

        if (!foto_url) continue;

        const isBase64 = !foto_url.startsWith('http') && foto_url.length > 100;
        
        let pathOrUri = null;

        if (isBase64) {
          const base64Pure = foto_url.replace(/^data:image\/[a-z]+;base64,/, "");
          const savedFile = await Filesystem.writeFile({
            path: tempFileName,
            data: base64Pure,
            directory: Directory.Cache,
            recursive: true
          });
          pathOrUri = savedFile.uri || savedFile.path;
        } else {
          const downloadResult = await Filesystem.downloadFile({
            url: foto_url,
            path: tempFileName,
            directory: Directory.Cache
          });
          pathOrUri = downloadResult.path || downloadResult.uri;
        }

        if (pathOrUri) {
          const localUri = pathOrUri.startsWith('file://') ? pathOrUri : `file://${pathOrUri}`;
          arquivosLocais.push(localUri);
        }
      }

      if (arquivosLocais.length > 0) {
        await Share.share({
          files: arquivosLocais
        });
      }
    } catch (erro) {
      console.log("Compartilhamento cancelado na Busca Online:", erro);
    } finally {
      setIsSharing(false);
      setFotosSelecionadas([]);
    }
  };

  const renderImage = (foto_url) => {
    if (!foto_url) return null;
    try {
      const isBase64 = !foto_url.startsWith('http') && foto_url.length > 100;
      const src = isBase64 && !foto_url.startsWith('data:image') 
        ? `data:image/jpeg;base64,${foto_url}` 
        : foto_url;
      
      return <img src={src} alt="Evidência" className="online-photo-img" loading="lazy" onError={(e) => { e.target.onerror = null; e.target.src = 'placeholder.png' }} />;
    } catch (e) {
      return <div className="online-photo-error">Imagem Inválida</div>;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="backup-modal-overlay" onClick={onClose}>
      <div className="backup-modal-container" onClick={(e) => e.stopPropagation()}>
        <header className="backup-modal-header">
          <div className="backup-header-title">
            <Folder size={22} color="#10b981" />
            <h3>Gerenciador de Backups</h3>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" className="btn-refresh" onClick={carregarPastas} disabled={isLoadingOffline} style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: '#64748b' }} title="Recarregar Pastas">
              <RefreshCw size={20} className={isLoadingOffline ? "spin" : ""} />
            </button>
            <button type="button" className="btn-close-modal" onClick={onClose} style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: '#64748b' }}>
              <X size={24} />
            </button>
          </div>
        </header>

        <div className="backup-modal-tabs">
          <button 
            className={`backup-tab ${activeTab === 'offline' ? 'active' : ''}`}
            onClick={() => setActiveTab('offline')}
          >
            <Folder size={16} /> Lotes Offline
          </button>
          <button 
            className={`backup-tab ${activeTab === 'online' ? 'active' : ''}`}
            onClick={() => setActiveTab('online')}
          >
            <Cloud size={16} /> Busca Online (Supabase)
          </button>
        </div>

        <div className="backup-modal-body">
          {activeTab === 'offline' ? (
            <>
              <div className="backup-actions-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: '6px', marginBottom: '16px' }}>
                <p className="backup-subtitle" style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Lotes de fotos salvos offline no aparelho.</p>
              </div>

              {isLoadingOffline && condominios.length === 0 ? (
                <div className="backup-loading">
                  <Loader2 size={30} className="spin" />
                  <p>Carregando pastas locais...</p>
                </div>
              ) : condominios.length === 0 ? (
                <div className="backup-empty">
                  <ImageIcon size={48} color="#cbd5e1" />
                  <p>Nenhuma foto salva no armazenamento organizado ainda.</p>
                </div>
              ) : (
                <div className="backup-list">
                  {condominios.map((condo) => (
                    <div key={condo.pathFisico} className={`backup-item ${expandedCondo === condo.pathFisico ? 'expanded' : ''}`}>
                      <div className="backup-item-header" onClick={() => toggleCondo(condo.pathFisico)}>
                        <div className="backup-item-title">
                          {expandedCondo === condo.pathFisico ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                          <span className="condo-name">{condo.nome}</span>
                        </div>
                        <div className="backup-item-actions">
                          <span className="backup-item-count">
                            {condo.arquivos.length} foto(s)
                          </span>
                          <button 
                            className="btn-delete-batch" 
                            onClick={(e) => handleExcluirLote(e, condo)} 
                            title="Excluir Lote"
                          >
                            <Trash2 size={18} color="#ef4444" />
                          </button>
                        </div>
                      </div>

                      {expandedCondo === condo.pathFisico && (
                        <div className="backup-item-details">
                          <div className="file-list-preview" style={{ 
                            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', 
                            alignContent: 'flex-start', justifyItems: 'start', padding: '8px 0', 
                            height: '240px', overflowY: 'scroll', WebkitOverflowScrolling: 'touch', paddingRight: '6px',
                            marginBottom: '16px' 
                          }}>
                            {condo.arquivos.map(arq => (
                              <div key={arq.name} className="file-preview-item" title={arq.name} style={{ width: '70px', height: '70px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                <img 
                                  src={arq.dataUrl} 
                                  alt={arq.name} 
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} 
                                  onClick={() => setFotoAmpliada(arq.dataUrl)}
                                />
                                <div style={{ position: 'absolute', top: '4px', right: '4px', backgroundColor: 'white', borderRadius: '50%', padding: '2px', display: 'flex', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                                  {arq.isPending ? <Clock size={12} color="#f59e0b" title="Pendente (só no celular)" /> : <Cloud size={12} color="#10b981" title="Sincronizado" />}
                                </div>
                                <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '10px', textAlign: 'center', padding: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {arq.name.split('_')[0].replace('Apto', '')}
                                </span>
                              </div>
                            ))}
                          </div>
                          <button 
                            className="btn-share-batch" 
                            onClick={() => handleCompartilhar(condo)}
                            disabled={isSharing}
                          >
                            {isSharing ? <Loader2 size={18} className="spin" /> : <Share2 size={18} />}
                            Compartilhar Lote Completo (WhatsApp)
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="backup-online-section">
              {isSyncing && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px', backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '6px', marginBottom: '12px', fontSize: '14px', fontWeight: '500' }}>
                  <Loader2 size={16} className="spin" />
                  <span>Sincronizando fotos pendentes...</span>
                </div>
              )}
              <form className="backup-search-bar" onSubmit={(e) => e.preventDefault()}>
                <div className="search-input-wrapper">
                  <Search size={18} className="search-icon" />
                  <input 
                    type="text" 
                    placeholder="Buscar por condomínio..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                  />
                  {isSearchingOnline && <Loader2 size={18} className="spin" style={{ position: 'absolute', right: '12px', color: '#64748b' }} />}
                </div>
              </form>

              {searchError && (
                <div className="backup-error-message">
                  {searchError}
                </div>
              )}

              {isSearchingOnline ? (
                <div className="backup-loading">
                  <Loader2 size={30} className="spin" />
                  <p>Buscando fotos no Supabase...</p>
                </div>
              ) : (
                <div className="backup-list">
                  {Object.values(
                    onlinePhotos.reduce((acc, item) => {
                      const nome = item.condominio_nome || 'Condomínio Desconhecido';
                      if (!acc[nome]) acc[nome] = { nome, pathFisico: `online_${nome}`, arquivos: [] };
                      acc[nome].arquivos.push(item);
                      return acc;
                    }, {})
                  ).map((condo) => (
                    <div key={condo.pathFisico} className={`backup-item ${expandedCondoOnline === condo.pathFisico ? 'expanded' : ''}`}>
                      <div className="backup-item-header" onClick={() => toggleCondoOnline(condo.pathFisico)}>
                        <div className="backup-item-title">
                          {expandedCondoOnline === condo.pathFisico ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                          <span className="condo-name">{condo.nome}</span>
                        </div>
                        <div className="backup-item-actions">
                          <span className="backup-item-count">
                            {condo.arquivos.length} foto(s)
                          </span>
                        </div>
                      </div>

                      {expandedCondoOnline === condo.pathFisico && (
                        <div className="backup-item-details">
                          <div className="file-list-preview" style={{ 
                            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', 
                            alignContent: 'flex-start', justifyItems: 'start', padding: '8px 0', 
                            height: '240px', overflowY: 'scroll', WebkitOverflowScrolling: 'touch', paddingRight: '6px',
                            marginBottom: '16px' 
                          }}>
                            {condo.arquivos.map((item) => (
                              <div key={item.id} className="file-preview-item" style={{ width: '70px', height: '70px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                <div 
                                  className="online-photo-img-container" 
                                  style={{ position: 'relative', width: '100%', height: '100%', cursor: item.isPending ? 'default' : 'pointer', backgroundColor: item.isPending ? '#f8fafc' : 'transparent' }}
                                  onClick={() => {
                                    if (!item.isPending && item.foto_url) {
                                      setFotoAmpliada(item.foto_url);
                                    }
                                  }}
                                >
                                  {item.isPending ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', color: '#94a3b8' }}>
                                      <CloudUpload size={20} className="spin-slow" />
                                    </div>
                                  ) : (
                                    renderImage(item.foto_url)
                                  )}
                                  <div style={{ position: 'absolute', top: '4px', right: '4px', backgroundColor: 'white', borderRadius: '50%', padding: '2px', display: 'flex', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                                    {item.isPending ? <Clock size={12} color="#f59e0b" title="Pendente na fila" /> : <Cloud size={12} color="#10b981" title="Nuvem" />}
                                  </div>
                                  <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '10px', textAlign: 'center', padding: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {item.unidade_id || '-'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {fotoAmpliada && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0, 0, 0, 0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          onClick={() => setFotoAmpliada(null)}
        >
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }} onClick={(e) => e.stopPropagation()}>
            <img src={fotoAmpliada} alt="Ampliada" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }} />
            <button 
              onClick={() => setFotoAmpliada(null)} 
              style={{ position: 'absolute', top: '-15px', right: '-15px', background: 'white', borderRadius: '50%', border: 'none', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
            >
              <X size={20} color="black" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackupFotosMenu;
