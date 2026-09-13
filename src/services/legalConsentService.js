import { supabase } from './supabase';

export const LEGAL_TERMS_VERSION = '2026-09-13';

const LEGAL_TERMS_VERSION_KEY = 'fast_leituras_legal_terms_version';
const LEGAL_TERMS_ACCEPTED_AT_KEY = 'fast_leituras_legal_terms_accepted_at';

export const hasLegalTermsAcceptance = (session) => (
  session?.user?.user_metadata?.[LEGAL_TERMS_VERSION_KEY] === LEGAL_TERMS_VERSION
);

export const registerLegalTermsAcceptance = async (session) => {
  if (!session?.user?.id) {
    throw new Error('Sessão de usuário inválida.');
  }

  const acceptedAt = new Date().toISOString();
  const currentMetadata = session.user.user_metadata || {};

  const { data, error } = await supabase.auth.updateUser({
    data: {
      ...currentMetadata,
      [LEGAL_TERMS_VERSION_KEY]: LEGAL_TERMS_VERSION,
      [LEGAL_TERMS_ACCEPTED_AT_KEY]: acceptedAt,
    },
  });

  if (error) {
    throw error;
  }

  return data?.user || session.user;
};
