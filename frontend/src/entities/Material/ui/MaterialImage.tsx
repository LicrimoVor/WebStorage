import {Box, Icon} from '@gravity-ui/uikit';
import {Picture} from '@gravity-ui/icons';

import styles from './MaterialImage.module.scss';

interface MaterialImageProps {
  image: string | null;
  name: string;
}

export function MaterialImage({image, name}: MaterialImageProps) {
  if (!image) {
    return (
      <Box className={styles.placeholder} aria-label="Нет изображения">
        <Icon data={Picture} size={20} />
      </Box>
    );
  }
  return <img className={styles.image} src={image} alt={name} loading="lazy" />;
}

