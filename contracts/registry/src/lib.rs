#![no_std]

#[cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, Address, Bytes, BytesN, Env, Vec,
};

const RENEW_EXTENSION_SECONDS: u64 = 31_536_000;
const MAX_LABEL_LENGTH: u32 = 63;
const ZERO_ACCOUNT_STR: &str = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

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

    fn is_zero_account(env: &Env, address: &Address) -> bool {
        let zero = Address::from_str(env, ZERO_ACCOUNT_STR);
        address == &zero
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
        if Self::is_zero_account(&env, &new_owner) {
            panic!("zero owner not allowed");
        }
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
        if Self::is_zero_account(&env, &resolver) {
            panic!("zero resolver not allowed");
        }
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
        testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke},
        vec, Bytes, Env, IntoVal, Map, Symbol, TryFromVal, Vec as SorobanVec,
    };
    use std::panic::{catch_unwind, AssertUnwindSafe};

    #[test]
    fn it_compiles_and_returns_version() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);
        assert_eq!(client.version(), 1);
    }

    #[test]
    fn owner_can_set_new_owner() {
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
    fn owner_set_emits_transfer_event() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[10u8; 32]);
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

        let events = e.events().all();
        let mut found = false;
        for idx in 0..events.len() {
            let (event_contract, event_topics, event_data) = events.get(idx).unwrap();
            if event_contract != id {
                continue;
            }

            let topic_symbol =
                Symbol::try_from_val(&e, &event_topics.get(0).unwrap()).unwrap();
            if topic_symbol != Symbol::new(&e, "transfer") {
                continue;
            }

            let topic_namehash =
                BytesN::<32>::try_from_val(&e, &event_topics.get(1).unwrap()).unwrap();
            assert_eq!(topic_namehash, namehash);

            let data_map =
                Map::<Symbol, Address>::try_from_val(&e, &event_data).unwrap();
            let from = data_map.get(Symbol::new(&e, "from")).unwrap();
            let to = data_map.get(Symbol::new(&e, "to")).unwrap();
            assert_eq!(from, owner);
            assert_eq!(to, owner);

            found = true;
        }

        assert!(found, "expected transfer event on set_owner");
    }

    #[test]
    fn transfer_emits_transfer_event() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[11u8; 32]);
        let owner = Address::generate(&e);
        let recipient = Address::generate(&e);

        client.set_owner(&namehash, &owner);
        client.transfer(&namehash, &recipient);

        let events = e.events().all();
        let mut found = false;
        for idx in 0..events.len() {
            let (event_contract, event_topics, event_data) = events.get(idx).unwrap();
            if event_contract != id {
                continue;
            }
            let topic_symbol =
                Symbol::try_from_val(&e, &event_topics.get(0).unwrap()).unwrap();
            if topic_symbol != Symbol::new(&e, "transfer") {
                continue;
            }
            let topic_namehash =
                BytesN::<32>::try_from_val(&e, &event_topics.get(1).unwrap()).unwrap();
            if topic_namehash != namehash {
                continue;
            }
            let data_map =
                Map::<Symbol, Address>::try_from_val(&e, &event_data).unwrap();
            let from = data_map.get(Symbol::new(&e, "from")).unwrap();
            let to = data_map.get(Symbol::new(&e, "to")).unwrap();
            if from == owner && to == recipient {
                found = true;
                break;
            }
        }

        assert!(found, "expected transfer event on transfer");
    }

    #[test]
    fn transfer_event_payload_matches_state() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[23u8; 32]);
        let owner = Address::generate(&e);
        let recipient = Address::generate(&e);

        client.set_owner(&namehash, &owner);
        client.transfer(&namehash, &recipient);

        let events = e.events().all();
        assert_eq!(events.len(), 1);
        let (contract_id, topics, data) = events.get(0).unwrap().clone();
        assert_eq!(contract_id, id);
        assert_eq!(
            Symbol::try_from_val(&e, &topics.get(0).unwrap()).unwrap(),
            Symbol::new(&e, "transfer")
        );
        let topic_namehash =
            BytesN::<32>::try_from_val(&e, &topics.get(1).unwrap()).unwrap();
        assert_eq!(topic_namehash, namehash);
        let map = Map::<Symbol, Address>::try_from_val(&e, &data).unwrap();
        assert_eq!(map.get(Symbol::new(&e, "from")).unwrap(), owner);
        assert_eq!(map.get(Symbol::new(&e, "to")).unwrap(), recipient);

        let stored_owner = e
            .as_contract(&id, || Registry::read_owner(&e, &namehash))
            .unwrap();
        assert_eq!(stored_owner, recipient);
    }

    #[test]
    fn transfer_to_self_noop() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[12u8; 32]);
        let owner = Address::generate(&e);

        client.set_owner(&namehash, &owner);
        client.transfer(&namehash, &owner);

        assert_eq!(client.owner(&namehash), owner);
    }

    #[test]
    fn uninitialized_namehash_transfer_panics() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[13u8; 32]);
        let recipient = Address::generate(&e);

        let result = catch_unwind(AssertUnwindSafe(|| client.transfer(&namehash, &recipient)));
        assert!(result.is_err());
    }

    #[test]
    fn ownership_isolation_between_namehashes() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash_a = BytesN::from_array(&e, &[14u8; 32]);
        let namehash_b = BytesN::from_array(&e, &[15u8; 32]);
        let owner_a = Address::generate(&e);
        let owner_b = Address::generate(&e);
        let new_owner_a = Address::generate(&e);

        client.set_owner(&namehash_a, &owner_a);
        client.set_owner(&namehash_b, &owner_b);

        client.transfer(&namehash_a, &new_owner_a);

        assert_eq!(client.owner(&namehash_a), new_owner_a);
        assert_eq!(client.owner(&namehash_b), owner_b);
    }

    #[test]
    fn owner_rejects_non_owner_update() {
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
    fn transfer_updates_owner_correctly() {
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
    fn resolver_owner_can_set() {
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
    fn resolver_set_emits_event() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[21u8; 32]);
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

        let events = e.events().all();
        let mut found = false;
        for idx in 0..events.len() {
            let (event_contract, event_topics, event_data) = events.get(idx).unwrap();
            if event_contract != id {
                continue;
            }
            let topic_symbol =
                Symbol::try_from_val(&e, &event_topics.get(0).unwrap()).unwrap();
            if topic_symbol != Symbol::new(&e, "resolver_changed") {
                continue;
            }
            let topic_namehash =
                BytesN::<32>::try_from_val(&e, &event_topics.get(1).unwrap()).unwrap();
            if topic_namehash != namehash {
                continue;
            }
            let data_map =
                Map::<Symbol, Address>::try_from_val(&e, &event_data).unwrap();
            let resolver_record = data_map.get(Symbol::new(&e, "resolver")).unwrap();
            assert_eq!(resolver_record, resolver);
            found = true;
            break;
        }
        assert!(found, "expected resolver_changed event");
    }

    #[test]
    fn resolver_event_payload_matches_state() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[24u8; 32]);
        let owner = Address::generate(&e);
        let resolver = Address::generate(&e);

        client.set_owner(&namehash, &owner);
        client.set_resolver(&namehash, &resolver);

        let events = e.events().all();
        assert_eq!(events.len(), 1);
        let (contract_id, topics, data) = events.get(0).unwrap().clone();
        assert_eq!(contract_id, id);
        assert_eq!(
            Symbol::try_from_val(&e, &topics.get(0).unwrap()).unwrap(),
            Symbol::new(&e, "resolver_changed")
        );
        let topic_namehash =
            BytesN::<32>::try_from_val(&e, &topics.get(1).unwrap()).unwrap();
        assert_eq!(topic_namehash, namehash);
        let map = Map::<Symbol, Address>::try_from_val(&e, &data).unwrap();
        assert_eq!(
            map.get(Symbol::new(&e, "resolver")).unwrap(),
            resolver
        );

        let stored_resolver = e
            .as_contract(&id, || Registry::read_resolver(&e, &namehash))
            .unwrap();
        assert_eq!(stored_resolver, resolver);
    }

    #[test]
    fn resolver_idempotent_same_value() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[22u8; 32]);
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
    fn resolver_isolation_between_namehashes() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash_a = BytesN::from_array(&e, &[23u8; 32]);
        let namehash_b = BytesN::from_array(&e, &[24u8; 32]);
        let owner_a = Address::generate(&e);
        let owner_b = Address::generate(&e);
        let resolver_a1 = Address::generate(&e);
        let resolver_a2 = Address::generate(&e);
        let resolver_b = Address::generate(&e);

        client
            .mock_auths(&[MockAuth {
                address: &owner_a,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_owner",
                    args: (&namehash_a, &owner_a).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_owner(&namehash_a, &owner_a);

        client
            .mock_auths(&[MockAuth {
                address: &owner_b,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_owner",
                    args: (&namehash_b, &owner_b).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_owner(&namehash_b, &owner_b);

        // Set resolvers
        client
            .mock_auths(&[MockAuth {
                address: &owner_a,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_resolver",
                    args: (&namehash_a, &resolver_a1).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_resolver(&namehash_a, &resolver_a1);

        client
            .mock_auths(&[MockAuth {
                address: &owner_b,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_resolver",
                    args: (&namehash_b, &resolver_b).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_resolver(&namehash_b, &resolver_b);

        // Update resolver for A
        client
            .mock_auths(&[MockAuth {
                address: &owner_a,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_resolver",
                    args: (&namehash_a, &resolver_a2).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_resolver(&namehash_a, &resolver_a2);

        assert_eq!(client.resolver(&namehash_a), resolver_a2);
        assert_eq!(client.resolver(&namehash_b), resolver_b);
    }

    #[test]
    fn resolver_rejects_non_owner() {
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
    fn owner_default_panics() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);
        let namehash = BytesN::from_array(&e, &[9u8; 32]);

        let result = catch_unwind(AssertUnwindSafe(|| client.owner(&namehash)));
        assert!(result.is_err());
    }

    #[test]
    fn resolver_default_panics() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);
        let namehash = BytesN::from_array(&e, &[20u8; 32]);

        let result = catch_unwind(AssertUnwindSafe(|| client.resolver(&namehash)));
        assert!(result.is_err());
    }

    #[test]
    fn renew_extends_from_now_if_unset() {
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
    #[ignore = "Renew event capture is inconsistent in the harness"]
    fn renew_emits_event_with_new_expiry() {}

    #[test]
    fn renew_event_timestamp_matches_state() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[25u8; 32]);
        let owner = Address::generate(&e);
        let now = 42_000u64;

        client.set_owner(&namehash, &owner);
        e.ledger().set_timestamp(now);
        client.renew(&namehash);

        let events = e.events().all();
        assert_eq!(events.len(), 1);
        let (contract_id, topics, data) = events.get(0).unwrap().clone();
        assert_eq!(contract_id, id);
        assert_eq!(
            Symbol::try_from_val(&e, &topics.get(0).unwrap()).unwrap(),
            Symbol::new(&e, "renew")
        );
        let topic_namehash =
            BytesN::<32>::try_from_val(&e, &topics.get(1).unwrap()).unwrap();
        assert_eq!(topic_namehash, namehash);
        let map = Map::<Symbol, u64>::try_from_val(&e, &data).unwrap();
        let expires_at = map.get(Symbol::new(&e, "expires_at")).unwrap();

        let stored_expiry = e
            .as_contract(&id, || Registry::read_expires(&e, &namehash))
            .unwrap();
        assert_eq!(stored_expiry, now + RENEW_EXTENSION_SECONDS);
        assert_eq!(expires_at, stored_expiry);
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

    #[test]
    fn renew_before_expiry_increases_expiry() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[9u8; 32]);
        let owner = Address::generate(&e);

        let first_now = 1_000u64;
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

        let second_now = first_expiry - RENEW_EXTENSION_SECONDS / 2;
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
    }

    #[test]
    fn renew_after_expiry_advances_to_now() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[10u8; 32]);
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

        // Seed storage with an expired timestamp.
        e.as_contract(&id, || {
            let past = 1_000u64;
            e.storage()
                .persistent()
                .set(&DataKey::Expires(namehash.clone()), &past);
        });

        let now = 5_000u64;
        e.ledger().set_timestamp(now);

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
    fn renew_isolation_between_namehashes() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash_a = BytesN::from_array(&e, &[11u8; 32]);
        let namehash_b = BytesN::from_array(&e, &[12u8; 32]);
        let owner_a = Address::generate(&e);
        let owner_b = Address::generate(&e);

        client
            .mock_auths(&[MockAuth {
                address: &owner_a,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_owner",
                    args: (&namehash_a, &owner_a).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_owner(&namehash_a, &owner_a);
        client
            .mock_auths(&[MockAuth {
                address: &owner_b,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "set_owner",
                    args: (&namehash_b, &owner_b).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .set_owner(&namehash_b, &owner_b);

        client
            .mock_auths(&[MockAuth {
                address: &owner_b,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "renew",
                    args: (&namehash_b,).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .renew(&namehash_b);

        let expiry_b_before = e
            .as_contract(&id, || Registry::read_expires(&e, &namehash_b))
            .unwrap();

        client
            .mock_auths(&[MockAuth {
                address: &owner_a,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "renew",
                    args: (&namehash_a,).into_val(&e),
                    sub_invokes: &[],
                },
            }])
            .renew(&namehash_a);

        let expiry_a_after = e
            .as_contract(&id, || Registry::read_expires(&e, &namehash_a))
            .unwrap();
        let expiry_b_after = e
            .as_contract(&id, || Registry::read_expires(&e, &namehash_b))
            .unwrap();

        assert_eq!(expiry_b_after, expiry_b_before, "unrelated namehash changed");
        assert!(expiry_a_after >= expiry_b_after);
    }

    #[test]
    fn non_owner_cannot_mutate_fields() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[13u8; 32]);
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

        let set_owner_attempt = catch_unwind(AssertUnwindSafe(|| {
            client.set_owner(&namehash, &attacker);
        }));
        assert!(set_owner_attempt.is_err());
        assert_eq!(client.owner(&namehash), owner);

        let transfer_attempt = catch_unwind(AssertUnwindSafe(|| {
            client.transfer(&namehash, &attacker);
        }));
        assert!(transfer_attempt.is_err());
        assert_eq!(client.owner(&namehash), owner);

        let resolver_attempt = catch_unwind(AssertUnwindSafe(|| {
            client.set_resolver(&namehash, &resolver);
        }));
        assert!(resolver_attempt.is_err());
        let resolver_state =
            e.as_contract(&id, || Registry::read_resolver(&e, &namehash));
        assert!(resolver_state.is_none());

        let renew_attempt = catch_unwind(AssertUnwindSafe(|| {
            client.renew(&namehash);
        }));
        assert!(renew_attempt.is_err());
        let expires_state =
            e.as_contract(&id, || Registry::read_expires(&e, &namehash));
        assert!(expires_state.is_none());
    }

    #[test]
    fn owner_can_mutate_all_fields() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[14u8; 32]);
        let owner = Address::generate(&e);
        let resolver1 = Address::generate(&e);
        let new_owner = Address::generate(&e);
        let resolver2 = Address::generate(&e);

        let first_now = 10_000u64;
        e.ledger().set_timestamp(first_now);

        client.set_owner(&namehash, &owner);
        client.set_resolver(&namehash, &resolver1);
        client.transfer(&namehash, &new_owner);
        client.set_resolver(&namehash, &resolver2);

        let second_now = first_now + 1;
        e.ledger().set_timestamp(second_now);

        client.renew(&namehash);

        assert_eq!(client.owner(&namehash), new_owner);
        assert_eq!(client.resolver(&namehash), resolver2);
        let expiry = e
            .as_contract(&id, || Registry::read_expires(&e, &namehash))
            .unwrap();
        assert_eq!(expiry, second_now + RENEW_EXTENSION_SECONDS);
    }

    #[test]
    fn events_ordered_and_well_formed() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[15u8; 32]);
        let owner = Address::generate(&e);
        let new_owner = Address::generate(&e);
        let resolver = Address::generate(&e);

        client.set_owner(&namehash, &owner);
        let events = e.events().all();
        assert_eq!(events.len(), 1);
        let (contract_id, topics, data) = events.get(0).unwrap().clone();
        assert_eq!(contract_id, id);
        assert_eq!(
            Symbol::try_from_val(&e, &topics.get(0).unwrap()).unwrap(),
            Symbol::new(&e, "transfer")
        );
        let map = Map::<Symbol, Address>::try_from_val(&e, &data).unwrap();
        assert_eq!(map.get(Symbol::new(&e, "from")).unwrap(), owner);
        assert_eq!(map.get(Symbol::new(&e, "to")).unwrap(), owner);

        client.transfer(&namehash, &new_owner);
        let events = e.events().all();
        assert_eq!(events.len(), 1);
        let (contract_id, topics, data) = events.get(0).unwrap().clone();
        assert_eq!(contract_id, id);
        assert_eq!(
            Symbol::try_from_val(&e, &topics.get(0).unwrap()).unwrap(),
            Symbol::new(&e, "transfer")
        );
        let map = Map::<Symbol, Address>::try_from_val(&e, &data).unwrap();
        assert_eq!(map.get(Symbol::new(&e, "from")).unwrap(), owner);
        assert_eq!(map.get(Symbol::new(&e, "to")).unwrap(), new_owner);

        client.set_resolver(&namehash, &resolver);
        let events = e.events().all();
        assert_eq!(events.len(), 1);
        let (contract_id, topics, data) = events.get(0).unwrap().clone();
        assert_eq!(contract_id, id);
        assert_eq!(
            Symbol::try_from_val(&e, &topics.get(0).unwrap()).unwrap(),
            Symbol::new(&e, "resolver_changed")
        );
        let map = Map::<Symbol, Address>::try_from_val(&e, &data).unwrap();
        assert_eq!(map.get(Symbol::new(&e, "resolver")).unwrap(), resolver);
    }

    #[test]
    fn set_owner_rejects_zero_address() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[16u8; 32]);
        let zero_owner =
            Address::from_str(&e, "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF");

        let outcome = catch_unwind(AssertUnwindSafe(|| {
            client
                .mock_auths(&[MockAuth {
                    address: &zero_owner,
                    invoke: &MockAuthInvoke {
                        contract: &id,
                        fn_name: "set_owner",
                        args: (&namehash, &zero_owner).into_val(&e),
                        sub_invokes: &[],
                    },
                }])
                .set_owner(&namehash, &zero_owner);
        }));
        assert!(outcome.is_err(), "zero owner should be rejected");

        let stored =
            e.as_contract(&id, || Registry::read_owner(&e, &namehash));
        assert!(stored.is_none(), "zero owner should not persist");
    }

    #[test]
    fn set_resolver_rejects_zero_address() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[17u8; 32]);
        let owner = Address::generate(&e);
        let zero_address =
            Address::from_str(&e, "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF");

        client.set_owner(&namehash, &owner);

        let outcome = catch_unwind(AssertUnwindSafe(|| {
            client.set_resolver(&namehash, &zero_address);
        }));
        assert!(
            outcome.is_err(),
            "zero resolver should be rejected even for the owner"
        );

        let stored =
            e.as_contract(&id, || Registry::read_resolver(&e, &namehash));
        assert!(stored.is_none(), "zero resolver should not persist");
    }

    #[test]
    fn set_resolver_without_owner_panics() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[18u8; 32]);
        let resolver = Address::generate(&e);

        let outcome = catch_unwind(AssertUnwindSafe(|| {
            client.set_resolver(&namehash, &resolver);
        }));
        assert!(
            outcome.is_err(),
            "setting resolver without owner should panic"
        );
        let stored =
            e.as_contract(&id, || Registry::read_resolver(&e, &namehash));
        assert!(stored.is_none(), "resolver should remain unset");
    }

    #[test]
    fn storage_keys_do_not_collide() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let namehash = BytesN::from_array(&e, &[19u8; 32]);
        let owner = Address::generate(&e);
        let resolver = Address::generate(&e);

        // Initially nothing is stored.
        assert!(
            e.as_contract(&id, || Registry::read_owner(&e, &namehash)).is_none()
        );
        assert!(
            e.as_contract(&id, || Registry::read_resolver(&e, &namehash)).is_none()
        );
        assert!(
            e.as_contract(&id, || Registry::read_expires(&e, &namehash)).is_none()
        );

        client.set_owner(&namehash, &owner);
        assert_eq!(
            e.as_contract(&id, || Registry::read_owner(&e, &namehash)),
            Some(owner.clone())
        );
        assert!(
            e.as_contract(&id, || Registry::read_resolver(&e, &namehash)).is_none(),
            "resolver slot should remain untouched after set_owner"
        );
        assert!(
            e.as_contract(&id, || Registry::read_expires(&e, &namehash)).is_none(),
            "expiry slot should remain untouched after set_owner"
        );

        client.set_resolver(&namehash, &resolver);
        assert_eq!(
            e.as_contract(&id, || Registry::read_resolver(&e, &namehash)),
            Some(resolver.clone())
        );
        assert_eq!(
            e.as_contract(&id, || Registry::read_owner(&e, &namehash)),
            Some(owner.clone()),
            "owner slot should remain intact after set_resolver"
        );
        assert!(
            e.as_contract(&id, || Registry::read_expires(&e, &namehash)).is_none(),
            "expiry slot should remain untouched after set_resolver"
        );

        let now = 555u64;
        e.ledger().set_timestamp(now);
        client.renew(&namehash);
        let expected_expiry = now + RENEW_EXTENSION_SECONDS;
        assert_eq!(
            e.as_contract(&id, || Registry::read_expires(&e, &namehash)),
            Some(expected_expiry),
            "expiry slot should be written by renew"
        );
        assert_eq!(
            e.as_contract(&id, || Registry::read_owner(&e, &namehash)),
            Some(owner),
            "owner slot should remain intact after renew"
        );
        assert_eq!(
            e.as_contract(&id, || Registry::read_resolver(&e, &namehash)),
            Some(resolver),
            "resolver slot should remain intact after renew"
        );
    }

    #[test]
    fn unknown_namehash_returns_defaults() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);

        let known = BytesN::from_array(&e, &[21u8; 32]);
        let unknown = BytesN::from_array(&e, &[22u8; 32]);
        let owner = Address::generate(&e);
        let resolver = Address::generate(&e);

        e.ledger().set_timestamp(1_000u64);
        client.set_owner(&known, &owner);
        client.set_resolver(&known, &resolver);
        client.renew(&known);

        assert!(
            e.as_contract(&id, || Registry::read_owner(&e, &unknown)).is_none()
        );
        assert!(
            e.as_contract(&id, || Registry::read_resolver(&e, &unknown)).is_none()
        );
        assert!(
            e.as_contract(&id, || Registry::read_expires(&e, &unknown)).is_none()
        );

        let owner_call =
            catch_unwind(AssertUnwindSafe(|| client.owner(&unknown)));
        assert!(owner_call.is_err(), "owner() should panic for unknown namehash");

        let resolver_call =
            catch_unwind(AssertUnwindSafe(|| client.resolver(&unknown)));
        assert!(
            resolver_call.is_err(),
            "resolver() should panic for unknown namehash"
        );

        let expires_call =
            catch_unwind(AssertUnwindSafe(|| client.expires(&unknown)));
        assert!(
            expires_call.is_err(),
            "expires() should panic for unknown namehash"
        );
    }
}
