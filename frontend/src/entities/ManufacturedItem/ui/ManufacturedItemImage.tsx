import {Picture} from '@gravity-ui/icons';
import {Box, Icon} from '@gravity-ui/uikit';

import styles from './ManufacturedItemImage.module.scss';

interface ManufacturedItemImageProps {
  image: string | null;
  name: string;
}

export function ManufacturedItemImage({image, name}: ManufacturedItemImageProps) {
  if (!image) {
    return (
      <Box className={styles.placeholder} aria-label="Нет изображения">
        <Icon data={Picture} size={20} />
      </Box>
    );
  }
  return <img className={styles.image} src={image} alt={name} loading="lazy" />;
}
