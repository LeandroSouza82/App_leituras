import React, { useState, useEffect } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { X, Folder, Image as ImageIcon, Share2, ChevronDown, ChevronRight, Loader2, RefreshCw, Trash2, Search, Cloud } from 'lucide-react';
import { buscarCondominios } from '../../services/condominioService';
import { supabase } from '../../services/supabase';
import { filesystemService } from '../../services/filesystemService';
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

  // ================= Online State =================
  const [searchQuery, setSearchQuery] = useState('');
  const [onlinePhotos, setOnlinePhotos] = useState([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    if (isOpen && activeTab === 'offline') {
      carregarPastas();
    }
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

                   return {
                      name: fName,
                      dataUrl: webPath
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
          
          fileUris.push(savedFile.uri);
        } catch (err) {}
      }

      if (fileUris.length === 0) {
        alert("Nenhum arquivo pôde ser preparado para envio.");
        return;
      }

      const shareOptions = {
        files: fileUris,
        dialogTitle: `Lote: ${condo.nome}`,
      };

      await Share.share(shareOptions);

    } catch (e) {
      alert('Ocorreu um erro ao compartilhar: ' + e.message);
    } finally {
      setIsSharing(false);
    }
  };

  const handleExcluirLote = async (e, condo) => {
    e.stopPropagation();
    if (!window.confirm("Deseja realmente excluir este lote de fotos do dispositivo?")) return;

    try {
      await filesystemService.excluirLote(condo.pathFisico);
      setCondominios(prev => prev.filter(c => c.pathFisico !== condo.pathFisico));
      
      if (expandedCondo === condo.pathFisico) {
        setExpandedCondo(null);
      }
    } catch (err) {
      alert('Ocorreu um erro ao excluir o lote: ' + err.message);
    }
  };

  // ================= Online Functions =================
  const handleSearchOnline = async (e) => {
    if (e) e.preventDefault();

    setIsSearchingOnline(true);
    setSearchError('');
    setOnlinePhotos([]);

    try {
      let query = supabase.from('leituras_detalhes').select('*');

      if (searchQuery.trim()) {
        query = query.ilike('condominio_nome', `%${searchQuery.trim()}%`);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      
      // Filter photos that have a foto_url
      const photos = (data || []).filter(item => item.foto_url);
      setOnlinePhotos(photos);
      
      if (photos.length === 0) {
          setSearchError('Nenhuma foto encontrada.');
      }
    } catch (err) {
      setSearchError('Erro ao buscar fotos online: ' + err.message);
    } finally {
      setIsSearchingOnline(false);
    }
  };

  const handleShareWhatsAppOnline = async (item) => {
    const isBase64 = item.foto_url && !item.foto_url.startsWith('http') && item.foto_url.length > 100;
    
    let file = null;

    if (isBase64) {
      try {
        const base64Pure = item.foto_url.replace(/^data:image\/[a-z]+;base64,/, "");
        const byteCharacters = atob(base64Pure);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });
        file = new File([blob], `evidencia_${item.id || Date.now()}.jpg`, { type: 'image/jpeg' });
      } catch (e) {
        console.error("Erro ao converter base64 para File", e);
      }
    }

    const textoMensagem = `*Evidência de Leitura*\nCondomínio: ${item.condominio_nome || 'N/A'}\nUnidade: ${item.unidade || 'N/A'}\nData: ${item.data_leitura ? new Date(item.data_leitura).toLocaleDateString() : 'N/A'}`;

    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: 'Evidência de Leitura',
          text: textoMensagem,
          files: [file]
        });
        return;
      } catch (err) {
        console.warn("Erro no navigator.share, tentando fallback wa.me", err);
      }
    }

    // Fallback: wa.me
    const finalMsg = file 
      ? textoMensagem + "\n\n*Nota:* A imagem não pôde ser anexada automaticamente." 
      : textoMensagem + (item.foto_url && item.foto_url.startsWith('http') ? `\n\nLink: ${item.foto_url}` : '');
      
    const wameUrl = `https://wa.me/?text=${encodeURIComponent(finalMsg)}`;
    window.open(wameUrl, '_blank');
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
          <button type="button" className="btn-close-modal" onClick={onClose}>
            <X size={20} />
          </button>
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
              <div className="backup-actions-bar">
                <p className="backup-subtitle">Lotes de fotos salvos offline no aparelho.</p>
                <button className="btn-refresh" onClick={carregarPastas} disabled={isLoadingOffline}>
                  {isLoadingOffline ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
                </button>
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
                          <div className="file-list-preview" style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '8px 0' }}>
                            {condo.arquivos.map(arq => (
                              <div key={arq.name} className="file-preview-item" title={arq.name} style={{ width: '56px', height: '56px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                <img src={arq.dataUrl} alt={arq.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '9px', textAlign: 'center', padding: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {arq.name.split('_')[0].replace('Apto', '')}
                                </span>
                              </div>
                            ))}
                          </div>
                          {condo.arquivos.length > 5 && (
                              <div className="file-preview-more">...e mais {condo.arquivos.length - 5} arquivos.</div>
                            )}
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
              <form className="backup-search-bar" onSubmit={handleSearchOnline}>
                <div className="search-input-wrapper">
                  <Search size={18} className="search-icon" />
                  <input 
                    type="text" 
                    placeholder="Buscar por condomínio..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                  />
                </div>
                <button type="submit" className="btn-search" disabled={isSearchingOnline}>
                  {isSearchingOnline ? <Loader2 size={18} className="spin" /> : 'Buscar'}
                </button>
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
                <div className="online-photos-grid">
                  {onlinePhotos.map((item) => (
                    <div key={item.id} className="online-photo-card">
                      <div className="online-photo-img-container">
                        {renderImage(item.foto_url)}
                      </div>
                      <div className="online-photo-info">
                        <strong>{item.condominio_nome || 'Condomínio Desconhecido'}</strong>
                        <p>Unid: {item.unidade_id || '-'}</p>
                        <p className="photo-date">{item.created_at ? new Date(item.created_at).toLocaleString() : (item.data_leitura ? new Date(item.data_leitura).toLocaleDateString() : '')}</p>
                      </div>
                      <button 
                        className="btn-share-whatsapp" 
                        onClick={() => handleShareWhatsAppOnline(item)}
                        title="Enviar para WhatsApp"
                      >
                        <Share2 size={16} /> Enviar WhatsApp
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BackupFotosMenu;
