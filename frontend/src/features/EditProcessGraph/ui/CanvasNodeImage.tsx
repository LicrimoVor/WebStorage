import {Picture} from '@gravity-ui/icons';
import {Icon} from '@gravity-ui/uikit';
import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {apiRequest} from '@/shared/api';
import styles from './ProcessCanvas.module.scss';

export function CanvasNodeImage({type, referenceId, name, image}: {
  type: 'material' | 'manufactured_item'; referenceId: string | null | undefined;
  name: string; image: string | null | undefined;
}) {
  const entity = type === 'material' ? 'materials' : 'manufactured-items';
  const query = useQuery({
    queryKey: [entity, 'detail', referenceId],
    queryFn: ({signal}) => apiRequest<{image: string | null}>(`/${entity}/${referenceId}`, {signal}),
    enabled: Boolean(referenceId) && image === undefined,
    staleTime: 60_000,
    retry: false,
  });
  const url = image === undefined ? query.data?.image : image;
  const [failedUrl, setFailedUrl] = useState<string>();
  return url && url !== failedUrl
    ? <img className={styles.nodeImage} src={url} alt={name} draggable={false} onError={() => setFailedUrl(url)} />
    : <div className={styles.nodeImagePlaceholder} aria-label={`Нет изображения: ${name}`}><Icon data={Picture} size={28} /></div>;
}
