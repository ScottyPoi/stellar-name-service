#![no_std]

#[cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, Address, Bytes, BytesN, Env, Vec,
};

const RENEW_EXTENSION_SECONDS: u64 = 31_536_000;
const MAX_LABEL_LENGTH: u32 = 63;

/// Storage key namespaces (placeholders for future data layout).
mod keys {
    pub const OWNER: &[u8] = b"REG_OWNER";     // namehash -> Address
    pub const RESOLVER: &[u8] = b"REG_RESOLV";  // namehash -> Address
    pub const EXPIRES: &[u8] = b"REG_EXPIRE";   // namehash -> u64
    pub const FLAGS: &[u8] = b"REG_FLAGS";      // namehash -> u32 (bitflags)
}

/// Event payload types (expand as needed).
#[derive(Clone)]
#[contractevent(topics = ["transfer"])]
pub struct EvtTransfer {
    #[topic]
    pub namehash: BytesN<32>,
    pub from: Address,
    pub to: Address,
}

#[derive(Clone)]
#[contractevent(topics = ["resolver_changed"])]
pub struct EvtResolverChanged {
    #[topic]
    pub namehash: BytesN<32>,
    pub resolver: Address,
}

#[derive(Clone)]
#[contractevent(topics = ["renew"])]
pub struct EvtRenew {
    #[topic]
    pub namehash: BytesN<32>,
    pub expires_at: u64,
}

#[contract]
pub struct Registry;

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Owner(BytesN<32>),
    Resolver(BytesN<32>),
    Expires(BytesN<32>),
}

/// Minimal, compilable interface. Add real logic later.
#[contractimpl]
impl Registry {
    /// Trivial function so the contract exports at least one method.
    pub fn version(_env: Env) -> u32 {
        1
    }

    fn read_owner(env: &Env, namehash: &BytesN<32>) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Owner(namehash.clone()))
    }

    pub(crate) fn read_resolver(env: &Env, namehash: &BytesN<32>) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Resolver(namehash.clone()))
    }

    pub(crate) fn read_expires(env: &Env, namehash: &BytesN<32>) -> Option<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::Expires(namehash.clone()))
    }

    // --- Stubs to be implemented later ---
    pub fn set_owner(env: Env, namehash: BytesN<32>, new_owner: Address) {
        let key = DataKey::Owner(namehash.clone());
        let storage = env.storage().persistent();
        let current_owner: Option<Address> = storage.get(&key);

        match current_owner.as_ref() {
            Some(owner) => owner.require_auth(),
            None => new_owner.require_auth(),
        }

        env.storage().persistent().set(&key, &new_owner);

        let from = current_owner.unwrap_or_else(|| new_owner.clone());
        EvtTransfer {
            namehash,
            from,
            to: new_owner,
        }
        .publish(&env);
    }

    pub fn owner(env: Env, namehash: BytesN<32>) -> Address {
        Self::read_owner(&env, &namehash).unwrap_or_else(|| panic!("owner not set"))
    }

    pub fn transfer(env: Env, namehash: BytesN<32>, to: Address) {
        let current_owner =
            Self::read_owner(&env, &namehash).unwrap_or_else(|| panic!("owner not set"));
        current_owner.require_auth();
        Self::set_owner(env, namehash, to);
    }

    pub fn set_resolver(env: Env, namehash: BytesN<32>, resolver: Address) {
        let owner =
            Self::read_owner(&env, &namehash).unwrap_or_else(|| panic!("owner not set"));
        owner.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::Resolver(namehash.clone()), &resolver);
        EvtResolverChanged { namehash, resolver }.publish(&env);
    }

    pub fn resolver(env: Env, namehash: BytesN<32>) -> Address {
        Self::read_resolver(&env, &namehash).unwrap_or_else(|| panic!("resolver not set"))
    }

    pub fn renew(env: Env, namehash: BytesN<32>) {
        let owner =
            Self::read_owner(&env, &namehash).unwrap_or_else(|| panic!("owner not set"));
        owner.require_auth();

        let now = env.ledger().timestamp();
        let current_expiry = Self::read_expires(&env, &namehash).unwrap_or(now);
        let base = if current_expiry > now {
            current_expiry
        } else {
            now
        };

        let new_expiry = base
            .checked_add(RENEW_EXTENSION_SECONDS)
            .unwrap_or_else(|| panic!("expiry overflow"));

        env.storage()
            .persistent()
            .set(&DataKey::Expires(namehash.clone()), &new_expiry);

        EvtRenew {
            namehash,
            expires_at: new_expiry,
        }
        .publish(&env);
    }

    pub fn expires(env: Env, namehash: BytesN<32>) -> u64 {
        Self::read_expires(&env, &namehash).unwrap_or_else(|| panic!("expiry not set"))
    }

    pub fn namehash(env: Env, labels: Vec<Bytes>) -> BytesN<32> {
        let mut node = BytesN::<32>::from_array(&env, &[0u8; 32]);
        for label in labels.iter() {
            if label.len() == 0 {
                panic!("empty label");
            }
            if label.len() > MAX_LABEL_LENGTH {
                panic!("label too long");
            }
            let label_hash = env.crypto().sha256(&label).to_bytes();
            let mut data = Bytes::from_slice(&env, &node.to_array());
            data.extend_from_slice(&label_hash.to_array());
            node = env.crypto().sha256(&data).to_bytes();
        }
        node
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
        vec, Bytes, Env, IntoVal, Vec as SorobanVec,
    };
    use std::panic::{catch_unwind, AssertUnwindSafe};

    #[test]
    fn it_compiles_and_returns_version() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);
        assert_eq!(client.version(), 1);
    }

    #[test]
    fn set_owner_persists_owner() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[1u8; 32]);
        let owner = Address::generate(&e);

        client
            .mock_auths(&[MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_owner",
                    args: (&namehash, &owner).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_owner(&namehash, &owner);

        assert_eq!(client.owner(&namehash), owner);
    }

    #[test]
    fn set_owner_requires_current_owner() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[2u8; 32]);
        let owner = Address::generate(&e);
        let attacker = Address::generate(&e);

        client
            .mock_auths(&[MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_owner",
                    args: (&namehash, &owner).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_owner(&namehash, &owner);

        let attempted_takeover = catch_unwind(AssertUnwindSafe(|| {
            client
                .mock_auths(&[MockAuth {
                    address: &attacker,
                    invoke: &MockAuthInvoke {
                        contract: &id,
                        fn_name: "set_owner",
                        args: (&namehash, &attacker).into_val(&e),
                        sub_invokes: &[],
                    },
                }])
                .set_owner(&namehash, &attacker);
        }));

        assert!(attempted_takeover.is_err());
        assert_eq!(client.owner(&namehash), owner);
    }

    #[test]
    fn transfer_updates_owner() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[3u8; 32]);
        let owner = Address::generate(&e);
        let recipient = Address::generate(&e);

        client.set_owner(&namehash, &owner);
        client.transfer(&namehash, &recipient);

        assert_eq!(client.owner(&namehash), recipient);
    }

    #[test]
    fn set_resolver_persists_resolver() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[4u8; 32]);
        let owner = Address::generate(&e);
        let resolver = Address::generate(&e);

        client
            .mock_auths(&[MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_owner",
                    args: (&namehash, &owner).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_owner(&namehash, &owner);

        client
            .mock_auths(&[MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_resolver",
                    args: (&namehash, &resolver).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_resolver(&namehash, &resolver);

        assert_eq!(client.resolver(&namehash), resolver);
    }

    #[test]
    fn set_resolver_requires_owner_auth() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[5u8; 32]);
        let owner = Address::generate(&e);
        let attacker = Address::generate(&e);
        let resolver = Address::generate(&e);

        client
            .mock_auths(&[MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_owner",
                    args: (&namehash, &owner).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_owner(&namehash, &owner);

        let result = catch_unwind(AssertUnwindSafe(|| {
            client
                .mock_auths(&[MockAuth {
                    address: &attacker,
                    invoke: &MockAuthInvoke {
                        contract: &id,
                        fn_name: "set_resolver",
                        args: (&namehash, &resolver).into_val(&e),
                        sub_invokes: &[],
                    },
                }])
                .set_resolver(&namehash, &resolver);
        }));

        assert!(result.is_err());
        let stored = e.as_contract(&id, || Registry::read_resolver(&e, &namehash));
        assert!(stored.is_none());
    }

    #[test]
    fn namehash_root_is_zero() {
        let e = Env::default();
        let labels: SorobanVec<Bytes> = vec![&e];
        let hash = Registry::namehash(e.clone(), labels);
        assert_eq!(hash.to_array(), [0u8; 32]);
    }

    #[test]
    fn namehash_single_label_deterministic() {
        let e = Env::default();
        let label = Bytes::from_slice(&e, b"stellar");

        let mut labels_a = vec![&e];
        labels_a.push_back(label.clone());
        let hash_a = Registry::namehash(e.clone(), labels_a);

        let mut labels_b = vec![&e];
        labels_b.push_back(label);
        let hash_b = Registry::namehash(e.clone(), labels_b);

        assert_eq!(hash_a, hash_b);
    }

    #[test]
    fn namehash_multiple_labels_order_sensitive() {
        let e = Env::default();

        let mut labels_one = vec![&e];
        labels_one.push_back(Bytes::from_slice(&e, b"foo"));
        labels_one.push_back(Bytes::from_slice(&e, b"bar"));
        let hash_one = Registry::namehash(e.clone(), labels_one);

        let mut labels_two = vec![&e];
        labels_two.push_back(Bytes::from_slice(&e, b"bar"));
        labels_two.push_back(Bytes::from_slice(&e, b"foo"));
        let hash_two = Registry::namehash(e.clone(), labels_two);

        assert_ne!(hash_one, hash_two);
    }

    #[test]
    fn namehash_unicode_utf8_stability() {
        let e = Env::default();
        let unicode_label = "stêllar🚀";

        let mut labels_one = vec![&e];
        labels_one.push_back(Bytes::from_slice(&e, unicode_label.as_bytes()));
        let hash_one = Registry::namehash(e.clone(), labels_one);

        let mut labels_two = vec![&e];
        labels_two.push_back(Bytes::from_slice(&e, unicode_label.as_bytes()));
        let hash_two = Registry::namehash(e.clone(), labels_two);

        assert_eq!(hash_one, hash_two);
    }

    #[test]
    fn namehash_rejects_empty_label() {
        let e = Env::default();
        let mut labels = vec![&e];
        labels.push_back(Bytes::new(&e));

        let result = catch_unwind(AssertUnwindSafe(|| Registry::namehash(e.clone(), labels)));
        assert!(result.is_err());
    }

    #[test]
    fn namehash_rejects_overlong_label() {
        let e = Env::default();
        let mut labels = vec![&e];
        let long_label_bytes: std::vec::Vec<u8> = core::iter::repeat(b'a')
            .take((MAX_LABEL_LENGTH + 1) as usize)
            .collect();
        let long_label = Bytes::from_slice(&e, &long_label_bytes);
        labels.push_back(long_label);

        let result = catch_unwind(AssertUnwindSafe(|| Registry::namehash(e.clone(), labels)));
        assert!(result.is_err());
    }

    #[test]
    fn renew_sets_initial_expiry() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[6u8; 32]);
        let owner = Address::generate(&e);
        let now = 1_700_000_000u64;
        e.ledger().set_timestamp(now);

        client
            .mock_auths(&[MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_owner",
                    args: (&namehash, &owner).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_owner(&namehash, &owner);

        client
            .mock_auths(&[MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "renew",
                    args: (&namehash,).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .renew(&namehash);

        let expiry = e
            .as_contract(&id, || Registry::read_expires(&e, &namehash))
            .unwrap();
        assert_eq!(expiry, now + RENEW_EXTENSION_SECONDS);
    }

    #[test]
    fn renew_extends_existing_expiry_from_current_value() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[7u8; 32]);
        let owner = Address::generate(&e);

        let first_now = 500u64;
        e.ledger().set_timestamp(first_now);

        client
            .mock_auths(&[MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_owner",
                    args: (&namehash, &owner).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_owner(&namehash, &owner);

        client
            .mock_auths(&[MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "renew",
                    args: (&namehash,).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .renew(&namehash);

        let first_expiry = e
            .as_contract(&id, || Registry::read_expires(&e, &namehash))
            .unwrap();

        let second_now = first_now + RENEW_EXTENSION_SECONDS / 2;
        e.ledger().set_timestamp(second_now);

        client
            .mock_auths(&[MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "renew",
                    args: (&namehash,).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .renew(&namehash);

        let second_expiry = e
            .as_contract(&id, || Registry::read_expires(&e, &namehash))
            .unwrap();

        assert_eq!(second_expiry, first_expiry + RENEW_EXTENSION_SECONDS);
        assert!(second_expiry > second_now);
    }

    #[test]
    fn renew_requires_owner_auth() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[8u8; 32]);
        let owner = Address::generate(&e);
        let attacker = Address::generate(&e);

        e.ledger().set_timestamp(1_234_567u64);

        client
            .mock_auths(&[MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_owner",
                    args: (&namehash, &owner).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_owner(&namehash, &owner);

        let attempt = catch_unwind(AssertUnwindSafe(|| {
            client
                .mock_auths(&[MockAuth {
                    address: &attacker,
                    invoke: &MockAuthInvoke {
                        contract: &id,
                        fn_name: "renew",
                        args: (&namehash,).into_val(&e),
                        sub_invokes: &[],
                    },
                }])
                .renew(&namehash);
        }));

        assert!(attempt.is_err());
        let expiry = e.as_contract(&id, || Registry::read_expires(&e, &namehash));
        assert!(expiry.is_none());
    }
}
