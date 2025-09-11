
export const Card = (props, context) => {
  const {
    title = '',
    subtitle = '',
    children = null,
    footer = null,
    image = null,
    imageAlt = '',
    variant = 'default',
    size = 'md',
    hoverable = false,
    clickable = false,
    onClick = null,
    className = '',
    style = {},
    ...otherProps
  } = props;

  const variants = {
    default: {
      border: '1px solid #d1d5db',
      backgroundColor: '#ffffff',
    },
    outlined: {
      border: '2px solid #3b82f6',
      backgroundColor: '#ffffff',
    },
    elevated: {
      border: 'none',
      backgroundColor: '#ffffff',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    },
    filled: {
      border: 'none',
      backgroundColor: '#f8fafc',
    },
  };

  const sizes = {
    sm: {
      borderRadius: '6px',
      headerPadding: '8px 12px',
      bodyPadding: '12px',
      footerPadding: '8px 12px',
    },
    md: {
      borderRadius: '8px',
      headerPadding: '12px 16px',
      bodyPadding: '16px',
      footerPadding: '12px 16px',
    },
    lg: {
      borderRadius: '12px',
      headerPadding: '16px 20px',
      bodyPadding: '20px',
      footerPadding: '16px 20px',
    },
  };

  const variantStyles = variants[variant] || variants.default;
  const sizeConfig = sizes[size] || sizes.md;

  const baseStyles = {
    ...variantStyles,
    borderRadius: sizeConfig.borderRadius,
    boxShadow: variant === 'elevated' ? variantStyles.boxShadow : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    transition: hoverable ? 'all 0.2s ease-in-out' : 'none',
    cursor: clickable ? 'pointer' : 'default',
    overflow: 'hidden',
    ...style,
  };

  const hoverStyles = hoverable ? {
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 8px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    }
  } : {};

  const headerStyles = {
    padding: sizeConfig.headerPadding,
    borderBottom: (title || subtitle) ? '1px solid #e5e7eb' : 'none',
  };

  const titleStyles = {
    fontWeight: 'bold',
    fontSize: size === 'lg' ? '1.25rem' : size === 'sm' ? '0.9rem' : '1rem',
    margin: '0 0 4px 0',
    color: '#111827',
  };

  const subtitleStyles = {
    fontSize: size === 'lg' ? '0.95rem' : size === 'sm' ? '0.8rem' : '0.875rem',
    color: '#6b7280',
    margin: '0',
  };

  const bodyStyles = {
    padding: sizeConfig.bodyPadding,
  };

  const footerStyles = {
    padding: sizeConfig.footerPadding,
    borderTop: footer ? '1px solid #e5e7eb' : 'none',
    backgroundColor: '#f9fafb',
    fontSize: '0.875rem',
    color: '#6b7280',
  };

  const imageStyles = {
    width: '100%',
    height: 'auto',
    display: 'block',
  };

  return {
    div: {
      className: `juris-card juris-card-${variant} juris-card-${size} ${hoverable ? 'juris-card-hoverable' : ''} ${clickable ? 'juris-card-clickable' : ''} ${className}`,
      style: { ...baseStyles, ...hoverStyles },
      onClick: clickable ? onClick : null,
      ...otherProps,
      children: [
        image && {
          img: {
            src: image,
            alt: imageAlt,
            style: imageStyles,
            className: 'juris-card-image',
          }
        },
        (title || subtitle) && {
          div: {
            className: 'juris-card-header',
            style: headerStyles,
            children: [
              title && {
                div: {
                  style: titleStyles,
                  children: title,
                }
              },
              subtitle && {
                div: {
                  style: subtitleStyles,
                  children: subtitle,
                }
              }
            ].filter(Boolean),
          }
        },
        children && {
          div: {
            className: 'juris-card-body',
            style: bodyStyles,
            children: children,
          }
        },
        footer && {
          div: {
            className: 'juris-card-footer',
            style: footerStyles,
            children: footer,
          }
        }
      ].filter(Boolean),
    },
  };
};
