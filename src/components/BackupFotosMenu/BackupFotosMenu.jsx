import React, { useState, useEffect } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { X, Folder, Image as ImageIcon, Share2, ChevronDown, ChevronRight, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { buscarCondominios } from '../../services/condominioService';
import './BackupFotosMenu.css';

const sanitizeName = (name) => {
  if (!name) return 'Desconhecido';
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
};

const BackupFotosMenu = ({ isOpen, onClose }) => {
  const [condominios, setCondominios] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedCondo, setExpandedCondo] = useState(null);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      carregarPastas();
    }
  }, [isOpen]);

  const carregarPastas = async () => {
    setIsLoading(true);
    try {
      const result = await Filesystem.readdir({
        path: 'FastLeituras',
        directory: Directory.Cache
      });

      let dbCondominios = [];
      try {
        dbCondominios = await buscarCondominios();
      } catch (e) {
        console.warn('[BackupFotosMenu] Não foi possível buscar condomínios para nomes originais.');
      }

      const pastasEncontradas = [];

      for (const item of result.files) {
        const nomePasta = item.name || item;
        // Verify if it's a directory
        try {
          const stat = await Filesystem.stat({
            path: `FastLeituras/${nomePasta}`,
            directory: Directory.Cache
          });
          
          if (stat.type === 'directory') {
            // Read contents
            const subResult = await Filesystem.readdir({
              path: `FastLeituras/${nomePasta}`,
              directory: Directory.Cache
            });
            
            const arquivos = subResult.files
              .map(f => f.name || f)
              .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'));

            if (arquivos.length > 0) {
              const matchedCondo = dbCondominios.find(c => sanitizeName(c.nome) === nomePasta);
              const nomeOriginal = matchedCondo ? matchedCondo.nome : nomePasta.replace(/_/g, ' ');

              pastasEncontradas.push({
                nome: nomeOriginal,
                pathFisico: nomePasta,
                arquivos: arquivos
              });
            }
          }
        } catch (e) {
          console.warn('Erro ao ler detalhes da pasta:', nomePasta, e);
        }
      }

      setCondominios(pastasEncontradas);
    } catch (e) {
      console.log('Pasta FastLeituras ainda não existe ou está vazia.');
      setCondominios([]);
    } finally {
      setIsLoading(false);
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
      const pastaCondominio = `FastLeituras/${condo.pathFisico}`;
      const fileUris = [];

      for (let i = 0; i < condo.arquivos.length; i++) {
        const fileName = condo.arquivos[i];
        const sourcePath = `${pastaCondominio}/${fileName}`;
        const tempFileName = `share_lote_${condo.pathFisico}_${i}.jpg`;
        
        try {
          const readFile = await Filesystem.readFile({
            path: sourcePath,
            directory: Directory.Cache
          });
          
          let base64Data = readFile.data;
          const base64Pure = base64Data.replace(/^data:image\/[a-z]+;base64,/, "");

          const savedFile = await Filesystem.writeFile({
            path: tempFileName,
            data: base64Pure,
            directory: Directory.Cache,
            recursive: true
          });
          
          fileUris.push(savedFile.uri);
        } catch (err) {
          console.error(`Erro ao processar foto ${fileName} para compartilhamento:`, err);
        }
      }

      if (fileUris.length === 0) {
        alert("Nenhum arquivo pôde ser preparado para envio.");
        return;
      }

      const shareOptions = {
        files: fileUris,
        dialogTitle: `Lote: ${condo.nome}`,
      };

      // Sem legenda de texto para evitar problemas de compatibilidade do WhatsApp
      // (Envia sempre APENAS as fotos)

      await Share.share(shareOptions);

    } catch (e) {
      console.error('[BackupFotosMenu] Erro ao compartilhar:', e);
      alert('Ocorreu um erro ao compartilhar: ' + e.message);
    } finally {
      setIsSharing(false);
    }
  };

  const handleExcluirLote = async (e, condo) => {
    e.stopPropagation(); // Evita expandir o acordeão
    if (!window.confirm("Deseja realmente excluir este lote de fotos do dispositivo?")) return;

    try {
      await Filesystem.rmdir({
        path: `FastLeituras/${condo.pathFisico}`,
        directory: Directory.Cache,
        recursive: true
      });
      // Atualiza o estado removendo o lote
      setCondominios(prev => prev.filter(c => c.pathFisico !== condo.pathFisico));
      
      // Se estava expandido, limpa o estado
      if (expandedCondo === condo.pathFisico) {
        setExpandedCondo(null);
      }
    } catch (err) {
      console.error('Erro ao excluir lote:', err);
      alert('Ocorreu um erro ao excluir o lote: ' + err.message);
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

        <div className="backup-modal-body">
          <div className="backup-actions-bar">
            <p className="backup-subtitle">Lotes de fotos salvos offline no aparelho.</p>
            <button className="btn-refresh" onClick={carregarPastas} disabled={isLoading}>
              {isLoading ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
            </button>
          </div>

          {isLoading && condominios.length === 0 ? (
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
                      <div className="file-list-preview">
                        {condo.arquivos.slice(0, 5).map(arq => (
                          <div key={arq} className="file-preview-item">
                            <ImageIcon size={14} /> <span>{arq}</span>
                          </div>
                        ))}
                        {condo.arquivos.length > 5 && (
                          <div className="file-preview-more">...e mais {condo.arquivos.length - 5} arquivos.</div>
                        )}
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
        </div>
      </div>
    </div>
  );
};

export default BackupFotosMenu;
